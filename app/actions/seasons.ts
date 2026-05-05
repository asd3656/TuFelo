"use server"

import { revalidatePath } from "next/cache"
import { createServiceClient } from "@/lib/supabase/service"
import { computeEloMatch, getStartingEloForTier } from "@/lib/elo"
import { getSessionFromCookies } from "@/lib/auth/admin"
import { insertAdminLog } from "@/lib/admin-log"
import { computeStreakFromMatchList } from "@/lib/match-streak"
import type { EloTier } from "@/lib/elo"
import type { ActionResult } from "@/lib/types/tufelo"

/** 시즌/랭킹 관련 모든 경로 캐시를 무효화합니다 */
function revalidateSeasonPaths() {
  revalidatePath("/")
  revalidatePath("/ranking")
  revalidatePath("/creator")
}

/** Many match IDs in one `.in("id", ids)` can exceed PostgREST URL limits (400 Bad Request). */
const MATCH_ID_IN_CHUNK_SIZE = 120
const MATCH_UPDATE_PARALLEL_CHUNK_SIZE = 40
const MEMBER_UPDATE_PARALLEL_CHUNK_SIZE = 80

function chunkArray<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size))
  }
  return out
}

// ─── 내부 헬퍼 ──────────────────────────────────────────────

/** 현재 활성 시즌의 최종 순위를 season_rankings 테이블에 스냅샷으로 저장 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function saveSeasonSnapshot(supabase: any, seasonId: string): Promise<void> {
  const { data: members } = await supabase
    .from("members")
    .select("id, elo, wins, losses")
    .eq("is_active", true)
    .order("elo", { ascending: false })

  if (!members?.length) return

  const snapshotData = (members as Array<{ id: string; elo: number; wins: number; losses: number }>)
    .map((m, i) => ({
      season_id: seasonId,
      member_id: m.id,
      final_elo: m.elo,
      final_wins: m.wins,
      final_losses: m.losses,
      rank: i + 1,
    }))

  await supabase
    .from("season_rankings")
    .upsert(snapshotData, { onConflict: "season_id,member_id" })
}

/**
 * 현재 시즌 전체 ELO 재계산.
 * startDate 이후 모든 경기를 시간순으로 재적용하고
 * members 테이블의 elo/wins/losses/streak을 갱신합니다.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function recalculateCurrentSeasonElo(supabase: any, seasonId: string, startDate: string): Promise<void> {
  const { data: allMembers, error: allMembersErr } = await supabase
    .from("members")
    .select("id, tier, is_active")
  if (allMembersErr) throw new Error(`멤버 조회 실패: ${allMembersErr.message}`)

  if (!allMembers?.length) return

  type MemberRow = { id: string; tier: number; is_active: boolean }
  const memberList = allMembers as MemberRow[]

  const eloMap = new Map<string, number>()
  const winsMap = new Map<string, number>()
  const lossesMap = new Map<string, number>()
  const tierMap = new Map<string, EloTier>()

  for (const m of memberList) {
    const tier = m.tier as EloTier
    eloMap.set(m.id, getStartingEloForTier(tier))
    winsMap.set(m.id, 0)
    lossesMap.set(m.id, 0)
    tierMap.set(m.id, tier)
  }

  // startDate 이전이면서 이 시즌 id를 가진 경기 → 비시즌으로 되돌리기
  const { error: resetPreSeasonErr } = await supabase
    .from("matches")
    .update({ season_id: null, player1_elo_before: null, player2_elo_before: null, player1_elo_delta: null, player2_elo_delta: null })
    .eq("season_id", seasonId)
    .lt("played_date", startDate)
  if (resetPreSeasonErr) throw new Error(`시즌 이전 경기 초기화 실패: ${resetPreSeasonErr.message}`)

  // startDate 이후 모든 경기 (시간순)
  const { data: matches, error: matchesErr } = await supabase
    .from("matches")
    .select("id, player1_id, player2_id, winner_id, played_date, created_at")
    .gte("played_date", startDate)
    .order("played_date", { ascending: true })
    .order("created_at", { ascending: true })
  if (matchesErr) throw new Error(`경기 조회 실패: ${matchesErr.message}`)

  const matchList = (matches ?? []) as Array<{
    id: string
    player1_id: string
    player2_id: string
    winner_id: string
    played_date: string
    created_at: string
  }>

  // 이 시즌에 속하도록 season_id 일괄 업데이트
  if (matchList.length > 0) {
    const ids = matchList.map((m) => m.id)
    for (const idChunk of chunkArray(ids, MATCH_ID_IN_CHUNK_SIZE)) {
      const { error: seasonTagErr } = await supabase
        .from("matches")
        .update({ season_id: seasonId })
        .in("id", idChunk)
      if (seasonTagErr) throw new Error(`시즌 태깅 실패: ${seasonTagErr.message}`)
    }
  }

  // ELO 시뮬레이션 (winner_id 기준)
  type MatchUpdate = {
    id: string
    p1_elo_before: number
    p2_elo_before: number
    p1_elo_delta: number
    p2_elo_delta: number
  }
  const matchUpdates: MatchUpdate[] = []

  for (const match of matchList) {
    const p1Id = match.player1_id
    const p2Id = match.player2_id
    const elo1 = eloMap.get(p1Id) ?? getStartingEloForTier(tierMap.get(p1Id) ?? 4)
    const elo2 = eloMap.get(p2Id) ?? getStartingEloForTier(tierMap.get(p2Id) ?? 4)

    const isP1Winner = match.winner_id === p1Id
    const isP2Winner = match.winner_id === p2Id
    if (!isP1Winner && !isP2Winner) {
      throw new Error(`winner_id가 player1/player2와 일치하지 않습니다. match_id=${match.id}`)
    }

    const winnerBaseElo = isP1Winner ? elo1 : elo2
    const loserBaseElo = isP1Winner ? elo2 : elo1
    const { newWinnerElo, newLoserElo, winnerDelta, loserDelta } = computeEloMatch(winnerBaseElo, loserBaseElo)

    const p1NewElo = isP1Winner ? newWinnerElo : newLoserElo
    const p2NewElo = isP1Winner ? newLoserElo : newWinnerElo
    const p1Delta = isP1Winner ? winnerDelta : loserDelta
    const p2Delta = isP1Winner ? loserDelta : winnerDelta

    eloMap.set(p1Id, p1NewElo)
    eloMap.set(p2Id, p2NewElo)

    const winnerId = isP1Winner ? p1Id : p2Id
    const loserId = isP1Winner ? p2Id : p1Id
    winsMap.set(winnerId, (winsMap.get(winnerId) ?? 0) + 1)
    lossesMap.set(loserId, (lossesMap.get(loserId) ?? 0) + 1)

    matchUpdates.push({
      id: match.id,
      p1_elo_before: elo1,
      p2_elo_before: elo2,
      p1_elo_delta: p1Delta,
      p2_elo_delta: p2Delta,
    })
  }

  // 경기별 ELO 값 업데이트 (건별 update를 청크 병렬 처리)
  if (matchUpdates.length > 0) {
    for (const chunk of chunkArray(matchUpdates, MATCH_UPDATE_PARALLEL_CHUNK_SIZE)) {
      const results = await Promise.all(
        chunk.map((u) =>
          supabase
            .from("matches")
            .update({
              player1_elo_before: u.p1_elo_before,
              player2_elo_before: u.p2_elo_before,
              player1_elo_delta: u.p1_elo_delta,
              player2_elo_delta: u.p2_elo_delta,
            })
            .eq("id", u.id),
        ),
      )
      for (const [idx, r] of results.entries()) {
        if (r.error) {
          const failedId = chunk[idx]?.id ?? "unknown"
          throw new Error(`경기 ELO 업데이트 실패(${failedId}): ${r.error.message}`)
        }
      }
    }
  }

  // streak 인메모리 계산 (최신순으로 뒤집어서)
  const reversedMatches = [...matchList].reverse()
  const participants = new Set(matchList.flatMap((m) => [m.player1_id, m.player2_id]))

  // 멤버 스탯 일괄 업데이트 (N번 개별 요청 → 1번 upsert로 최적화)
  const memberUpdateData = memberList
    .map((m) => {
      if (participants.has(m.id)) {
        const streak = computeStreakFromMatchList(m.id, reversedMatches)
        return {
          id: m.id,
          elo: eloMap.get(m.id) ?? getStartingEloForTier(tierMap.get(m.id) ?? 4),
          wins: winsMap.get(m.id) ?? 0,
          losses: lossesMap.get(m.id) ?? 0,
          streak,
        }
      } else if (m.is_active) {
        // 시즌 경기 없는 활성 선수 → 초기값으로 리셋
        return {
          id: m.id,
          elo: getStartingEloForTier(m.tier as EloTier),
          wins: 0,
          losses: 0,
          streak: 0,
        }
      }
      return null
    })
    .filter((v): v is NonNullable<typeof v> => v !== null)

  if (memberUpdateData.length > 0) {
    for (const chunk of chunkArray(memberUpdateData, MEMBER_UPDATE_PARALLEL_CHUNK_SIZE)) {
      const results = await Promise.all(
        chunk.map((row) =>
          supabase
            .from("members")
            .update({
              elo: row.elo,
              wins: row.wins,
              losses: row.losses,
              streak: row.streak,
            })
            .eq("id", row.id),
        ),
      )
      for (const [idx, r] of results.entries()) {
        if (r.error) {
          const failedId = chunk[idx]?.id ?? "unknown"
          throw new Error(`멤버 스탯 업데이트 실패(${failedId}): ${r.error.message}`)
        }
      }
    }
  }
}

// ─── 공개 서버 액션 ─────────────────────────────────────────

/**
 * 새 시즌 시작.
 * 현재 활성 시즌이 있으면 자동으로 스냅샷 저장 후 종료,
 * 활성 선수 ELO/승패/연속을 모두 초기화하고 새 시즌을 생성합니다.
 */
export async function startNewSeasonAction(input: {
  name: string
  startDate: string
}): Promise<ActionResult> {
  const session = await getSessionFromCookies()
  if (!session || session.role !== "creator") {
    return { ok: false, error: "제작자만 시즌을 관리할 수 있습니다." }
  }

  const name = input.name.trim()
  if (!name) return { ok: false, error: "시즌 이름을 입력하세요." }
  if (!input.startDate) return { ok: false, error: "시작 날짜를 입력하세요." }

  const supabase = createServiceClient()

  // 현재 활성 시즌 확인
  const { data: activeSeason } = await supabase
    .from("seasons")
    .select("id, name, start_date")
    .is("end_date", null)
    .maybeSingle()

  if (activeSeason) {
    // 스냅샷 저장
    await saveSeasonSnapshot(supabase, activeSeason.id as string)

    // 이전 시즌 종료 (새 시즌 시작일 - 1일)
    const endDate = new Date(input.startDate)
    endDate.setDate(endDate.getDate() - 1)
    const endDateStr = endDate.toISOString().slice(0, 10)

    await supabase
      .from("seasons")
      .update({ end_date: endDateStr })
      .eq("id", activeSeason.id)
  }

  // 활성 선수 ELO/승패/연속 초기화 (배치 upsert)
  const { data: activeMembers } = await supabase
    .from("members")
    .select("id, tier")
    .eq("is_active", true)

  const resetData = (activeMembers ?? []).map((m) => ({
    id: m.id,
    elo: getStartingEloForTier((m.tier as EloTier)),
    wins: 0,
    losses: 0,
    streak: 0,
  }))
  if (resetData.length > 0) {
    const { error: resetErr } = await supabase.from("members").upsert(resetData, { onConflict: "id" })
    if (resetErr) return { ok: false, error: `선수 초기화 실패: ${resetErr.message}` }
  }

  // 새 시즌 생성
  const { data: insertedSeason, error: insertErr } = await supabase
    .from("seasons")
    .insert({ name, start_date: input.startDate })
    .select("id")
    .single()

  if (insertErr) return { ok: false, error: insertErr.message }

  // 시작일 이후 경기에 새 시즌 태그 + ELO/전적/연속을 경기 원본 기준으로 재계산
  // (이 호출이 없으면 랭킹이 members 초기화·경기 season_id와 어긋나거나 이전과 동일하게 보일 수 있음)
  try {
    await recalculateCurrentSeasonElo(supabase, insertedSeason.id as string, input.startDate)
  } catch (e) {
    return {
      ok: false,
      error: `시즌은 생성됐으나 ELO 재계산에 실패했습니다. 제작자 페이지에서 「시즌 전적 재동기화」를 실행해 주세요. (${String(e)})`,
    }
  }

  await insertAdminLog(
    session.username,
    "시즌 시작",
    name,
    `start_date=${input.startDate}${activeSeason ? ` (이전: ${activeSeason.name as string})` : ""}`,
  )

  revalidateSeasonPaths()
  return { ok: true }
}

/**
 * 시즌 정보 수정.
 * 현재 활성 시즌의 startDate를 변경하면 ELO 전체 재계산이 실행됩니다.
 */
export async function updateSeasonAction(input: {
  id: string
  name: string
  startDate: string
  endDate: string | null
}): Promise<ActionResult> {
  const session = await getSessionFromCookies()
  if (!session || session.role !== "creator") {
    return { ok: false, error: "제작자만 시즌을 관리할 수 있습니다." }
  }

  const name = input.name.trim()
  if (!name) return { ok: false, error: "시즌 이름을 입력하세요." }
  if (!input.startDate) return { ok: false, error: "시작 날짜를 입력하세요." }

  const supabase = createServiceClient()

  const { data: season } = await supabase
    .from("seasons")
    .select("id, name, start_date, end_date")
    .eq("id", input.id)
    .single()

  if (!season) return { ok: false, error: "시즌을 찾을 수 없습니다." }

  const isActive = season.end_date === null
  const startDateChanged = (season.start_date as string) !== input.startDate

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updateData: Record<string, any> = { name }
  updateData.start_date = input.startDate
  if (!isActive) {
    updateData.end_date = input.endDate
  }

  const { error } = await supabase
    .from("seasons")
    .update(updateData)
    .eq("id", input.id)

  if (error) return { ok: false, error: error.message }

  // 현재 시즌의 시작일이 바뀌면 ELO 전체 재계산
  if (isActive && startDateChanged) {
    await recalculateCurrentSeasonElo(supabase, input.id, input.startDate)
  }

  await insertAdminLog(session.username, "시즌 수정", name, `start_date=${input.startDate}`)

  revalidateSeasonPaths()
  return { ok: true }
}

/**
 * 현재 활성 시즌의 ELO/전적/연속 기록을 경기 원본 기준으로 재동기화합니다.
 */
export async function syncCurrentSeasonStatsAction(): Promise<ActionResult> {
  const session = await getSessionFromCookies()
  if (!session || session.role !== "creator") {
    return { ok: false, error: "제작자만 시즌을 관리할 수 있습니다." }
  }

  const supabase = createServiceClient()
  const { data: activeSeason } = await supabase
    .from("seasons")
    .select("id, name, start_date")
    .is("end_date", null)
    .maybeSingle()

  if (!activeSeason) {
    return { ok: false, error: "진행 중인 시즌이 없습니다." }
  }

  const startedAt = Date.now()
  try {
    await recalculateCurrentSeasonElo(supabase, activeSeason.id as string, activeSeason.start_date as string)
  } catch (e) {
    const elapsedMs = Date.now() - startedAt
    await insertAdminLog(
      session.username,
      "시즌 전적 재동기화 실패",
      activeSeason.name as string,
      `start_date=${activeSeason.start_date as string}, elapsed_ms=${elapsedMs}, error=${String(e)}`,
    )
    return { ok: false, error: `재동기화 실패: ${String(e)}` }
  }

  const elapsedMs = Date.now() - startedAt
  await insertAdminLog(
    session.username,
    "시즌 전적 재동기화",
    activeSeason.name as string,
    `start_date=${activeSeason.start_date as string}, elapsed_ms=${elapsedMs}`,
  )

  revalidateSeasonPaths()
  return { ok: true }
}

/**
 * 시즌 삭제.
 * - 현재 활성 시즌: 경기가 있으면 삭제 불가. 경기 없으면 삭제 후 이전 시즌 복원.
 * - 종료된 시즌: 즉시 삭제 (season_rankings 도 cascade 삭제됨).
 */
export async function deleteSeasonAction(id: string): Promise<ActionResult> {
  const session = await getSessionFromCookies()
  if (!session || session.role !== "creator") {
    return { ok: false, error: "제작자만 시즌을 관리할 수 있습니다." }
  }

  const supabase = createServiceClient()

  const { data: season } = await supabase
    .from("seasons")
    .select("id, name, end_date")
    .eq("id", id)
    .single()

  if (!season) return { ok: false, error: "시즌을 찾을 수 없습니다." }

  const isActive = season.end_date === null

  if (isActive) {
    const { count } = await supabase
      .from("matches")
      .select("id", { count: "exact", head: true })
      .eq("season_id", id)

    if (count && count > 0) {
      return {
        ok: false,
        error: `이 시즌에 ${count}개의 경기가 있어 삭제할 수 없습니다. 경기를 먼저 삭제해 주세요.`,
      }
    }
  }

  const { error } = await supabase.from("seasons").delete().eq("id", id)
  if (error) return { ok: false, error: error.message }

  // 활성 시즌이었다면 → 직전 시즌 복원 및 ELO 재계산
  if (isActive) {
    const { data: prevSeason } = await supabase
      .from("seasons")
      .select("id, start_date")
      .order("start_date", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (prevSeason) {
      // 직전 시즌을 현재 시즌으로 복원
      await supabase.from("seasons").update({ end_date: null }).eq("id", prevSeason.id)
      // ELO 재계산 (직전 시즌 시작일 기준)
      await recalculateCurrentSeasonElo(supabase, prevSeason.id as string, prevSeason.start_date as string)
    } else {
      // 시즌 없음 → 모든 활성 선수 초기화 (배치 upsert)
      const { data: activeMembers } = await supabase
        .from("members")
        .select("id, tier")
        .eq("is_active", true)
      const resetData = (activeMembers ?? []).map((m) => ({
        id: m.id,
        elo: getStartingEloForTier((m.tier as EloTier)),
        wins: 0,
        losses: 0,
        streak: 0,
      }))
      if (resetData.length > 0) {
        await supabase.from("members").upsert(resetData, { onConflict: "id" })
      }
    }
  }

  await insertAdminLog(session.username, "시즌 삭제", season.name as string)

  revalidateSeasonPaths()
  return { ok: true }
}
