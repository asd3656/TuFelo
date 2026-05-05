"use server"

import { revalidatePath } from "next/cache"
import type { SupabaseClient } from "@supabase/supabase-js"
import { createServiceClient } from "@/lib/supabase/service"
import {
  applySeasonMatchMemberUpdatesRpc,
  applySeasonMatchMemberStatsOnlyRpc,
  applySeasonMatchUndoStatsRpc,
} from "@/lib/supabase/apply-season-match-members"
import { computeEloMatch } from "@/lib/elo"
import { getClientIp } from "@/lib/request-ip"
import { computeStreakForMember } from "@/lib/match-streak"
import { getSessionFromCookies } from "@/lib/auth/admin"
import { insertAdminLog } from "@/lib/admin-log"
import type { RegisterMatchInput, UpdateMatchInput, ActionResult } from "@/lib/types/tufelo"

const mapNamePattern = /^\S+$/

/** 전적 관련 경로 캐시를 모두 무효화합니다 */
function revalidateMatchPaths() {
  revalidatePath("/")
  revalidatePath("/admin")
  revalidatePath("/ranking")
}

/** 현재 활성 시즌 조회 (없으면 null) */
async function getActiveSeason(supabase: SupabaseClient) {
  const { data } = await supabase
    .from("seasons")
    .select("id, start_date")
    .is("end_date", null)
    .maybeSingle()
  return data as { id: string; start_date: string } | null
}

export async function registerMatchAction(input: RegisterMatchInput): Promise<ActionResult> {
  const session = await getSessionFromCookies()
  if (!session) {
    return { ok: false, error: "권한이 없습니다." }
  }

  if (input.player1Id === input.player2Id) {
    return { ok: false, error: "같은 선수를 선택할 수 없습니다." }
  }
  if (!mapNamePattern.test(input.mapName)) {
    return { ok: false, error: "맵 이름은 띄어쓰기 없이 입력해 주세요." }
  }
  if (!input.matchType || !input.matchType.trim()) {
    return { ok: false, error: "경기 유형을 입력해 주세요." }
  }

  const supabase = createServiceClient()

  const { data: m1, error: e1 } = await supabase
    .from("members")
    .select("id, name, elo, wins, losses, streak")
    .eq("id", input.player1Id)
    .single()

  const { data: m2, error: e2 } = await supabase
    .from("members")
    .select("id, name, elo, wins, losses, streak")
    .eq("id", input.player2Id)
    .single()

  if (e1 || !m1) return { ok: false, error: "선수 1 정보를 불러올 수 없습니다." }
  if (e2 || !m2) return { ok: false, error: "선수 2 정보를 불러올 수 없습니다." }

  // 현재 활성 시즌 확인 → 시즌 경기 여부 판단
  const activeSeason = await getActiveSeason(supabase)
  const isSeasonMatch = activeSeason !== null && input.playedDate >= activeSeason.start_date
  const seasonId = isSeasonMatch ? activeSeason!.id : null
  const isTeamPlay = input.mapName.includes("팀플")

  const userIp = await getClientIp()

  if (isSeasonMatch && !isTeamPlay) {
    // ─ 시즌 경기: ELO 계산 + 선수 스탯 업데이트
    const elo1 = m1.elo as number
    const elo2 = m2.elo as number
    const { newWinnerElo, newLoserElo, winnerDelta, loserDelta } = computeEloMatch(elo1, elo2)

    const w1 = m1.wins as number
    const l2 = m2.losses as number
    const s1 = m1.streak as number
    const s2 = m2.streak as number

    const nextStreakWinner = s1 > 0 ? s1 + 1 : 1
    const nextStreakLoser = s2 < 0 ? s2 - 1 : -1

    const { data: inserted, error: insErr } = await supabase
      .from("matches")
      .insert({
        player1_id: input.player1Id,
        player2_id: input.player2Id,
        winner_id: input.player1Id,
        map_name: input.mapName,
        match_type: input.matchType,
        played_date: input.playedDate,
        season_id: seasonId,
        player1_elo_before: elo1,
        player2_elo_before: elo2,
        player1_elo_delta: winnerDelta,
        player2_elo_delta: loserDelta,
        ...(userIp ? { user_ip: userIp } : {}),
      })
      .select("id")
      .single()

    if (insErr) return { ok: false, error: insErr.message }

    const matchId = inserted?.id as string | undefined

    const { error: u1 } = await supabase
      .from("members")
      .update({ elo: newWinnerElo, wins: w1 + 1, streak: nextStreakWinner })
      .eq("id", input.player1Id)

    const { error: u2 } = await supabase
      .from("members")
      .update({ elo: newLoserElo, losses: l2 + 1, streak: nextStreakLoser })
      .eq("id", input.player2Id)

    if (u1 || u2) {
      if (matchId) await supabase.from("matches").delete().eq("id", matchId)
      return { ok: false, error: u1?.message ?? u2?.message ?? "ELO 업데이트 실패" }
    }
  } else if (isSeasonMatch && isTeamPlay) {
    // ─ 팀플 시즌 경기: 승패/스트릭 업데이트, ELO 미반영
    const w1 = m1.wins as number
    const l2 = m2.losses as number
    const s1 = m1.streak as number
    const s2 = m2.streak as number

    const nextStreakWinner = s1 > 0 ? s1 + 1 : 1
    const nextStreakLoser = s2 < 0 ? s2 - 1 : -1

    const { data: inserted, error: insErr } = await supabase
      .from("matches")
      .insert({
        player1_id: input.player1Id,
        player2_id: input.player2Id,
        winner_id: input.player1Id,
        map_name: input.mapName,
        match_type: input.matchType,
        played_date: input.playedDate,
        season_id: seasonId,
        player1_elo_before: null,
        player2_elo_before: null,
        player1_elo_delta: null,
        player2_elo_delta: null,
        ...(userIp ? { user_ip: userIp } : {}),
      })
      .select("id")
      .single()

    if (insErr) return { ok: false, error: insErr.message }

    const matchId = inserted?.id as string | undefined

    const { error: u1 } = await supabase
      .from("members")
      .update({ wins: w1 + 1, streak: nextStreakWinner })
      .eq("id", input.player1Id)

    const { error: u2 } = await supabase
      .from("members")
      .update({ losses: l2 + 1, streak: nextStreakLoser })
      .eq("id", input.player2Id)

    if (u1 || u2) {
      if (matchId) await supabase.from("matches").delete().eq("id", matchId)
      return { ok: false, error: u1?.message ?? u2?.message ?? "스탯 업데이트 실패" }
    }
  } else {
    // ─ 비시즌 경기: ELO 계산 없이 경기 기록만 저장
    const { error: insErr } = await supabase
      .from("matches")
      .insert({
        player1_id: input.player1Id,
        player2_id: input.player2Id,
        winner_id: input.player1Id,
        map_name: input.mapName,
        match_type: input.matchType,
        played_date: input.playedDate,
        season_id: null,
        player1_elo_before: null,
        player2_elo_before: null,
        player1_elo_delta: null,
        player2_elo_delta: null,
        ...(userIp ? { user_ip: userIp } : {}),
      })

    if (insErr) return { ok: false, error: insErr.message }
  }

  await insertAdminLog(
    session.username,
    "전적 등록",
    `${m1.name as string}`,
    `player2=${m2.name as string} map=${input.mapName} type=${input.matchType} date=${input.playedDate} season=${seasonId ?? "비시즌"}`,
  )

  revalidateMatchPaths()
  return { ok: true }
}

export async function deleteMatchAction(matchId: string): Promise<ActionResult> {
  const session = await getSessionFromCookies()
  if (!session) {
    return { ok: false, error: "권한이 없습니다." }
  }

  const supabase = createServiceClient()
  const { data: row, error: fErr } = await supabase.from("matches").select("*").eq("id", matchId).single()
  if (fErr || !row) {
    return { ok: false, error: "전적을 찾을 수 없습니다." }
  }

  const p1 = row.player1_id as string
  const p2 = row.player2_id as string
  const rowSeasonId = row.season_id as string | null

  // 비시즌이면 경기 기록만 삭제 (ELO/스탯 변경 없음)
  if (!rowSeasonId) {
    const { error: delErr } = await supabase.from("matches").delete().eq("id", matchId)
    if (delErr) return { ok: false, error: delErr.message }
    const { data: m1 } = await supabase.from("members").select("name").eq("id", p1).single()
    const { data: m2 } = await supabase.from("members").select("name").eq("id", p2).single()
    await insertAdminLog(session.username, "전적 삭제", m1?.name ?? p1, `vs ${m2?.name ?? p2} matchId=${matchId} (비시즌)`)
    revalidateMatchPaths()
    return { ok: true }
  }

  // 종료된 시즌 경기이면 경기 기록만 삭제 (ELO/스탯 변경 없음)
  const { data: seasonRow } = await supabase
    .from("seasons")
    .select("id, end_date")
    .eq("id", rowSeasonId)
    .single()

  const isPastSeason = seasonRow && seasonRow.end_date !== null

  if (isPastSeason) {
    const { error: delErr } = await supabase.from("matches").delete().eq("id", matchId)
    if (delErr) return { ok: false, error: delErr.message }
    const { data: m1 } = await supabase.from("members").select("name").eq("id", p1).single()
    const { data: m2 } = await supabase.from("members").select("name").eq("id", p2).single()
    await insertAdminLog(session.username, "전적 삭제", m1?.name ?? p1, `vs ${m2?.name ?? p2} matchId=${matchId} (종료시즌)`)
    revalidateMatchPaths()
    return { ok: true }
  }

  // 현재 활성 시즌 경기: ELO/스탯 역산
  const winnerId = row.winner_id as string
  const loserId = winnerId === p1 ? p2 : p1
  const d1 = Number(row.player1_elo_delta ?? 0)
  const d2 = Number(row.player2_elo_delta ?? 0)

  const { data: m1, error: e1 } = await supabase.from("members").select("id, name, elo").eq("id", p1).single()
  const { data: m2, error: e2 } = await supabase.from("members").select("id, name, elo").eq("id", p2).single()
  if (e1 || !m1 || e2 || !m2) {
    return { ok: false, error: "선수 정보를 불러올 수 없습니다." }
  }

  const oldWinnerElo = winnerId === p1 ? (m1.elo as number) : (m2.elo as number)
  const oldLoserElo = winnerId === p1 ? (m2.elo as number) : (m1.elo as number)

  const { error: undoErr } = await applySeasonMatchUndoStatsRpc(supabase, {
    player1Id: p1,
    player2Id: p2,
    winnerId,
    player1EloDelta: d1,
    player2EloDelta: d2,
  })
  if (undoErr) {
    return { ok: false, error: undoErr.message }
  }

  const { error: delErr } = await supabase.from("matches").delete().eq("id", matchId)
  if (delErr) {
    const { error: restoreErr } = await applySeasonMatchMemberUpdatesRpc(supabase, {
      winnerId,
      loserId,
      winnerElo: oldWinnerElo,
      loserElo: oldLoserElo,
      winnerStreak: 0,
      loserStreak: 0,
    })
    if (restoreErr) {
      return {
        ok: false,
        error: `전적 삭제 실패 후 복구도 실패: ${delErr.message} / ${restoreErr.message}`,
      }
    }
    const rs1 = await computeStreakForMember(supabase, p1, rowSeasonId)
    const rs2 = await computeStreakForMember(supabase, p2, rowSeasonId)
    await supabase.from("members").update({ streak: rs1 }).eq("id", p1)
    await supabase.from("members").update({ streak: rs2 }).eq("id", p2)
    return { ok: false, error: delErr.message }
  }
  // 현재 시즌 경기만으로 연속승패 재계산
  const s1 = await computeStreakForMember(supabase, p1, rowSeasonId)
  const s2 = await computeStreakForMember(supabase, p2, rowSeasonId)
  await supabase.from("members").update({ streak: s1 }).eq("id", p1)
  await supabase.from("members").update({ streak: s2 }).eq("id", p2)

  await insertAdminLog(
    session.username,
    "전적 삭제",
    `${m1.name as string}`,
    `vs ${m2.name as string} matchId=${matchId}`,
  )

  revalidateMatchPaths()
  return { ok: true }
}

export async function updateMatchAction(input: UpdateMatchInput): Promise<ActionResult> {
  const session = await getSessionFromCookies()
  if (!session) {
    return { ok: false, error: "권한이 없습니다." }
  }

  if (!mapNamePattern.test(input.mapName)) {
    return { ok: false, error: "맵 이름은 띄어쓰기 없이 입력해 주세요." }
  }
  if (!input.matchType || !input.matchType.trim()) {
    return { ok: false, error: "경기 유형을 입력해 주세요." }
  }

  const supabase = createServiceClient()

  const { data: row, error: fErr } = await supabase
    .from("matches")
    .select("*")
    .eq("id", input.matchId)
    .single()
  if (fErr || !row) {
    return { ok: false, error: "수정할 전적을 찾을 수 없습니다." }
  }

  const oldP1Id = row.player1_id as string
  const oldP2Id = row.player2_id as string
  const rowSeasonId = row.season_id as string | null

  // 비시즌 경기: 경기 정보만 업데이트 (ELO 변경 없음)
  if (!rowSeasonId) {
    const { error: updErr } = await supabase
      .from("matches")
      .update({
        winner_id: input.isPlayer1Winner ? oldP1Id : oldP2Id,
        map_name: input.mapName,
        match_type: input.matchType,
        played_date: input.playedDate,
      })
      .eq("id", input.matchId)
    if (updErr) return { ok: false, error: updErr.message }
    const { data: m1 } = await supabase.from("members").select("name").eq("id", oldP1Id).single()
    const { data: m2 } = await supabase.from("members").select("name").eq("id", oldP2Id).single()
    await insertAdminLog(session.username, "전적 수정", m1?.name ?? oldP1Id, `vs ${m2?.name ?? oldP2Id} (비시즌)`)
    revalidateMatchPaths()
    return { ok: true }
  }

  // 종료된 시즌 경기: 경기 정보만 업데이트 (ELO 변경 없음)
  const { data: seasonRow } = await supabase
    .from("seasons")
    .select("id, end_date")
    .eq("id", rowSeasonId)
    .single()

  if (seasonRow && seasonRow.end_date !== null) {
    const { error: updErr } = await supabase
      .from("matches")
      .update({
        winner_id: input.isPlayer1Winner ? oldP1Id : oldP2Id,
        map_name: input.mapName,
        match_type: input.matchType,
        played_date: input.playedDate,
      })
      .eq("id", input.matchId)
    if (updErr) return { ok: false, error: updErr.message }
    const { data: m1 } = await supabase.from("members").select("name").eq("id", oldP1Id).single()
    const { data: m2 } = await supabase.from("members").select("name").eq("id", oldP2Id).single()
    await insertAdminLog(session.username, "전적 수정", m1?.name ?? oldP1Id, `vs ${m2?.name ?? oldP2Id} (종료시즌)`)
    revalidateMatchPaths()
    return { ok: true }
  }

  // 현재 활성 시즌 경기: undo RPC -> 경기 행 갱신 -> apply RPC
  const oldWinnerId = row.winner_id as string
  const oldLoserId = oldWinnerId === oldP1Id ? oldP2Id : oldP1Id
  const oldD1n = Number(row.player1_elo_delta ?? 0)
  const oldD2n = Number(row.player2_elo_delta ?? 0)

  const { data: m1, error: e1 } = await supabase
    .from("members")
    .select("id, name, elo")
    .eq("id", oldP1Id)
    .single()
  const { data: m2, error: e2 } = await supabase
    .from("members")
    .select("id, name, elo")
    .eq("id", oldP2Id)
    .single()
  if (e1 || !m1 || e2 || !m2) {
    return { ok: false, error: "선수 정보를 불러올 수 없습니다." }
  }

  const oldWinnerElo = oldWinnerId === oldP1Id ? (m1.elo as number) : (m2.elo as number)
  const oldLoserElo = oldWinnerId === oldP1Id ? (m2.elo as number) : (m1.elo as number)

  async function restoreOldSeasonMatchEffect() {
    await applySeasonMatchMemberUpdatesRpc(supabase, {
      winnerId: oldWinnerId,
      loserId: oldLoserId,
      winnerElo: oldWinnerElo,
      loserElo: oldLoserElo,
      winnerStreak: 0,
      loserStreak: 0,
    })
    const rs1 = await computeStreakForMember(supabase, oldP1Id, rowSeasonId)
    const rs2 = await computeStreakForMember(supabase, oldP2Id, rowSeasonId)
    await supabase.from("members").update({ streak: rs1 }).eq("id", oldP1Id)
    await supabase.from("members").update({ streak: rs2 }).eq("id", oldP2Id)
  }

  const { error: undoErr } = await applySeasonMatchUndoStatsRpc(supabase, {
    player1Id: oldP1Id,
    player2Id: oldP2Id,
    winnerId: oldWinnerId,
    player1EloDelta: oldD1n,
    player2EloDelta: oldD2n,
  })
  if (undoErr) {
    return { ok: false, error: undoErr.message }
  }

  const { data: m1b, error: e1b } = await supabase.from("members").select("elo").eq("id", oldP1Id).single()
  const { data: m2b, error: e2b } = await supabase.from("members").select("elo").eq("id", oldP2Id).single()
  if (e1b || !m1b || e2b || !m2b) {
    await restoreOldSeasonMatchEffect()
    return { ok: false, error: "선수 정보를 불러올 수 없습니다." }
  }

  const baseElo1 = m1b.elo as number
  const baseElo2 = m2b.elo as number

  const newWinnerId = input.isPlayer1Winner ? oldP1Id : oldP2Id
  const newLoserId = input.isPlayer1Winner ? oldP2Id : oldP1Id
  const isNewTeamPlay = input.mapName.includes("팀플")

  let newD1: number | null = null
  let newD2: number | null = null
  let newWinnerElo: number | undefined
  let newLoserElo: number | undefined

  if (!isNewTeamPlay) {
    const winnerBaseElo = input.isPlayer1Winner ? baseElo1 : baseElo2
    const loserBaseElo = input.isPlayer1Winner ? baseElo2 : baseElo1
    const result = computeEloMatch(winnerBaseElo, loserBaseElo)
    newWinnerElo = result.newWinnerElo
    newLoserElo = result.newLoserElo
    newD1 = input.isPlayer1Winner ? result.winnerDelta : result.loserDelta
    newD2 = input.isPlayer1Winner ? result.loserDelta : result.winnerDelta
  }

  const { error: updMatchErr } = await supabase
    .from("matches")
    .update({
      winner_id: newWinnerId,
      map_name: input.mapName,
      match_type: input.matchType,
      played_date: input.playedDate,
      player1_elo_before: isNewTeamPlay ? null : baseElo1,
      player2_elo_before: isNewTeamPlay ? null : baseElo2,
      player1_elo_delta: newD1,
      player2_elo_delta: newD2,
    })
    .eq("id", input.matchId)

  if (updMatchErr) {
    await restoreOldSeasonMatchEffect()
    return { ok: false, error: updMatchErr.message }
  }

  const applyResult = isNewTeamPlay
    ? await applySeasonMatchMemberStatsOnlyRpc(supabase, {
        winnerId: newWinnerId,
        loserId: newLoserId,
        winnerStreak: 0,
        loserStreak: 0,
      })
    : await applySeasonMatchMemberUpdatesRpc(supabase, {
        winnerId: newWinnerId,
        loserId: newLoserId,
        winnerElo: newWinnerElo!,
        loserElo: newLoserElo!,
        winnerStreak: 0,
        loserStreak: 0,
      })

  if (applyResult.error) {
    await supabase
      .from("matches")
      .update({
        winner_id: oldWinnerId,
        map_name: row.map_name,
        match_type: row.match_type,
        played_date: row.played_date,
        player1_elo_before: row.player1_elo_before,
        player2_elo_before: row.player2_elo_before,
        player1_elo_delta: row.player1_elo_delta,
        player2_elo_delta: row.player2_elo_delta,
      })
      .eq("id", input.matchId)
    await restoreOldSeasonMatchEffect()
    return { ok: false, error: applyResult.error.message }
  }
  // 현재 시즌 경기만으로 연속승패 재계산
  const s1 = await computeStreakForMember(supabase, oldP1Id, rowSeasonId)
  const s2 = await computeStreakForMember(supabase, oldP2Id, rowSeasonId)
  await supabase.from("members").update({ streak: s1 }).eq("id", oldP1Id)
  await supabase.from("members").update({ streak: s2 }).eq("id", oldP2Id)

  const winnerName = input.isPlayer1Winner ? (m1.name as string) : (m2.name as string)
  await insertAdminLog(
    session.username,
    "전적 수정",
    `${m1.name as string}`,
    `vs ${m2.name as string} winner=${winnerName} map=${input.mapName} type=${input.matchType} date=${input.playedDate}`,
  )

  revalidateMatchPaths()
  return { ok: true }
}
