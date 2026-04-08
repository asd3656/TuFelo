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
  revalidatePath("/ranking/public")
  revalidatePath("/creator")
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
  const { data: allMembers } = await supabase
    .from("members")
    .select("id, tier, is_active")

  if (!allMembers?.length) return

  type MemberRow = { id: string; tier: number; is_active: boolean }
  const memberList = allMembers as MemberRow[]

  const eloMap = new Map<string, number>()
  const winsMap = new Map<string, number>()
  const lossesMap = new Map<string, number>()
  const tierMap = new Map<string, EloTier>()
  const isActiveMap = new Map<string, boolean>()

  for (const m of memberList) {
    const tier = m.tier as EloTier
    eloMap.set(m.id, getStartingEloForTier(tier))
    winsMap.set(m.id, 0)
    lossesMap.set(m.id, 0)
    tierMap.set(m.id, tier)
    isActiveMap.set(m.id, m.is_active)
  }

  // startDate 이전이면서 이 시즌 id를 가진 경기 → 비시즌으로 되돌리기
  await supabase
    .from("matches")
    .update({ season_id: null, player1_elo_before: null, player2_elo_before: null, player1_elo_delta: null, player2_elo_delta: null })
    .eq("season_id", seasonId)
    .lt("played_date", startDate)

  // startDate 이후 모든 경기 (시간순)
  const { data: matches } = await supabase
    .from("matches")
    .select("id, player1_id, player2_id, winner_id, played_date, created_at")
    .gte("played_date", startDate)
    .order("played_date", { ascending: true })
    .order("created_at", { ascending: true })

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
    // Supabase는 in() 필터 bulk update를 지원합니다
    await supabase.from("matches").update({ season_id: seasonId }).in("id", ids)
  }

  // ELO 시뮬레이션 (player1이 항상 승자인 기존 관례 준수)
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

    const { newWinnerElo, newLoserElo, winnerDelta, loserDelta } = computeEloMatch(elo1, elo2)

    eloMap.set(p1Id, newWinnerElo)
    eloMap.set(p2Id, newLoserElo)
    winsMap.set(p1Id, (winsMap.get(p1Id) ?? 0) + 1)
    lossesMap.set(p2Id, (lossesMap.get(p2Id) ?? 0) + 1)

    matchUpdates.push({ id: match.id, p1_elo_before: elo1, p2_elo_before: elo2, p1_elo_delta: winnerDelta, p2_elo_delta: loserDelta })
  }

  // 경기별 ELO 값 일괄 업데이트 (N번 개별 요청 → 1번 upsert로 최적화)
  if (matchUpdates.length > 0) {
    await supabase.from("matches").upsert(
      matchUpdates.map((u) => ({
        id: u.id,
        player1_elo_before: u.p1_elo_before,
        player2_elo_before: u.p2_elo_before,
        player1_elo_delta: u.p1_elo_delta,
        player2_elo_delta: u.p2_elo_delta,
      })),
      { onConflict: "id" },
    )
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
    await supabase.from("members").upsert(memberUpdateData, { onConflict: "id" })
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
    await supabase.from("members").upsert(resetData, { onConflict: "id" })
  }

  // 새 시즌 생성
  const { error } = await supabase
    .from("seasons")
    .insert({ name, start_date: input.startDate })

  if (error) return { ok: false, error: error.message }

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
