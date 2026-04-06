"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { computeEloMatch } from "@/lib/elo"
import { getClientIp } from "@/lib/request-ip"
import { computeStreakForMember } from "@/lib/match-streak"
import { getSessionFromCookies } from "@/lib/auth/admin"
import { insertAdminLog } from "@/lib/admin-log"
import type { RegisterMatchInput, UpdateMatchInput } from "@/lib/types/tufelo"

const mapNamePattern = /^[가-힣]+$/

export type ActionResult = { ok: true } | { ok: false; error: string }

export async function registerMatchAction(input: RegisterMatchInput): Promise<ActionResult> {
  const session = await getSessionFromCookies()
  if (!session) {
    return { ok: false, error: "권한이 없습니다." }
  }

  if (input.player1Id === input.player2Id) {
    return { ok: false, error: "같은 선수를 선택할 수 없습니다." }
  }
  if (!mapNamePattern.test(input.mapName)) {
    return { ok: false, error: "맵 이름은 띄어쓰기 없이 한글만 입력해 주세요." }
  }
  if (!input.matchType || !input.matchType.trim()) {
    return { ok: false, error: "경기 유형을 입력해 주세요." }
  }

  const supabase = await createClient()

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

  const elo1 = m1.elo as number
  const elo2 = m2.elo as number
  const { newWinnerElo, newLoserElo, winnerDelta, loserDelta } = computeEloMatch(elo1, elo2)

  const w1 = m1.wins as number
  const l1 = m1.losses as number
  const s1 = m1.streak as number
  const w2 = m2.wins as number
  const l2 = m2.losses as number
  const s2 = m2.streak as number

  const nextStreakWinner = s1 > 0 ? s1 + 1 : 1
  const nextStreakLoser = s2 < 0 ? s2 - 1 : -1

  const userIp = await getClientIp()

  const { data: inserted, error: insErr } = await supabase
    .from("matches")
    .insert({
      player1_id: input.player1Id,
      player2_id: input.player2Id,
      winner_id: input.player1Id,
      map_name: input.mapName,
      match_type: input.matchType,
      played_date: input.playedDate,
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
    .update({
      elo: newWinnerElo,
      wins: w1 + 1,
      streak: nextStreakWinner,
    })
    .eq("id", input.player1Id)

  const { error: u2 } = await supabase
    .from("members")
    .update({
      elo: newLoserElo,
      losses: l2 + 1,
      streak: nextStreakLoser,
    })
    .eq("id", input.player2Id)

  if (u1 || u2) {
    if (matchId) await supabase.from("matches").delete().eq("id", matchId)
    return { ok: false, error: u1?.message ?? u2?.message ?? "ELO 업데이트 실패" }
  }

  await insertAdminLog(
    session.username,
    "전적 등록",
    `${m1.name as string}`,
    `player2=${m2.name as string} map=${input.mapName} type=${input.matchType} date=${input.playedDate}`,
  )

  revalidatePath("/")
  revalidatePath("/admin")
  revalidatePath("/ranking")
  return { ok: true }
}

export async function deleteMatchAction(matchId: string): Promise<ActionResult> {
  const session = await getSessionFromCookies()
  if (!session) {
    return { ok: false, error: "권한이 없습니다." }
  }

  const supabase = await createClient()
  const { data: row, error: fErr } = await supabase.from("matches").select("*").eq("id", matchId).single()
  if (fErr || !row) {
    return { ok: false, error: "전적을 찾을 수 없습니다." }
  }

  const p1 = row.player1_id as string
  const p2 = row.player2_id as string
  const winnerId = row.winner_id as string
  const d1 = row.player1_elo_delta as number | null
  const d2 = row.player2_elo_delta as number | null

  const { data: m1, error: e1 } = await supabase.from("members").select("*").eq("id", p1).single()
  const { data: m2, error: e2 } = await supabase.from("members").select("*").eq("id", p2).single()
  if (e1 || !m1 || e2 || !m2) {
    return { ok: false, error: "선수 정보를 불러올 수 없습니다." }
  }

  const elo1 = m1.elo as number
  const elo2 = m2.elo as number
  const w1 = m1.wins as number
  const l1 = m1.losses as number
  const w2 = m2.wins as number
  const l2 = m2.losses as number

  const nextElo1 = d1 != null ? elo1 - d1 : elo1
  const nextElo2 = d2 != null ? elo2 - d2 : elo2

  let nextW1 = w1
  let nextL1 = l1
  let nextW2 = w2
  let nextL2 = l2
  if (winnerId === p1) {
    nextW1 = Math.max(0, w1 - 1)
    nextL2 = Math.max(0, l2 - 1)
  } else {
    nextW2 = Math.max(0, w2 - 1)
    nextL1 = Math.max(0, l1 - 1)
  }

  const { error: up1 } = await supabase
    .from("members")
    .update({
      elo: nextElo1,
      wins: nextW1,
      losses: nextL1,
    })
    .eq("id", p1)

  const { error: up2 } = await supabase
    .from("members")
    .update({
      elo: nextElo2,
      wins: nextW2,
      losses: nextL2,
    })
    .eq("id", p2)

  if (up1 || up2) {
    return { ok: false, error: up1?.message ?? up2?.message ?? "ELO/전적 복구 실패" }
  }

  const { error: delErr } = await supabase.from("matches").delete().eq("id", matchId)
  if (delErr) {
    await supabase
      .from("members")
      .update({ elo: elo1, wins: w1, losses: l1 })
      .eq("id", p1)
    await supabase
      .from("members")
      .update({ elo: elo2, wins: w2, losses: l2 })
      .eq("id", p2)
    return { ok: false, error: delErr.message }
  }

  const s1 = await computeStreakForMember(supabase, p1)
  const s2 = await computeStreakForMember(supabase, p2)
  await supabase.from("members").update({ streak: s1 }).eq("id", p1)
  await supabase.from("members").update({ streak: s2 }).eq("id", p2)

  await insertAdminLog(
    session.username,
    "전적 삭제",
    `${m1.name as string}`,
    `vs ${m2.name as string} matchId=${matchId}`,
  )

  revalidatePath("/")
  revalidatePath("/admin")
  revalidatePath("/ranking")
  return { ok: true }
}

export async function updateMatchAction(input: UpdateMatchInput): Promise<ActionResult> {
  const session = await getSessionFromCookies()
  if (!session) {
    return { ok: false, error: "권한이 없습니다." }
  }

  if (!mapNamePattern.test(input.mapName)) {
    return { ok: false, error: "맵 이름은 띄어쓰기 없이 한글만 입력해 주세요." }
  }
  if (!input.matchType || !input.matchType.trim()) {
    return { ok: false, error: "경기 유형을 입력해 주세요." }
  }

  const supabase = await createClient()

  // 기존 경기 조회
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
  const oldWinnerId = row.winner_id as string
  const oldD1 = row.player1_elo_delta as number | null
  const oldD2 = row.player2_elo_delta as number | null

  // 기존 선수들 현재 상태 조회
  const { data: m1, error: e1 } = await supabase
    .from("members")
    .select("id, name, elo, wins, losses, streak")
    .eq("id", oldP1Id)
    .single()
  const { data: m2, error: e2 } = await supabase
    .from("members")
    .select("id, name, elo, wins, losses, streak")
    .eq("id", oldP2Id)
    .single()
  if (e1 || !m1 || e2 || !m2) {
    return { ok: false, error: "선수 정보를 불러올 수 없습니다." }
  }

  // 기존 ELO · 전적 원상복구 계산 (DB 반영 전)
  const baseElo1 = (m1.elo as number) - (oldD1 ?? 0)
  const baseElo2 = (m2.elo as number) - (oldD2 ?? 0)

  let baseW1 = m1.wins as number
  let baseL1 = m1.losses as number
  let baseW2 = m2.wins as number
  let baseL2 = m2.losses as number

  if (oldWinnerId === oldP1Id) {
    baseW1 = Math.max(0, baseW1 - 1)
    baseL2 = Math.max(0, baseL2 - 1)
  } else {
    baseW2 = Math.max(0, baseW2 - 1)
    baseL1 = Math.max(0, baseL1 - 1)
  }

  // 새 승자/패자 결정
  const newWinnerId = input.isPlayer1Winner ? oldP1Id : oldP2Id
  const winnerBaseElo = input.isPlayer1Winner ? baseElo1 : baseElo2
  const loserBaseElo = input.isPlayer1Winner ? baseElo2 : baseElo1

  const { newWinnerElo, newLoserElo, winnerDelta, loserDelta } = computeEloMatch(
    winnerBaseElo,
    loserBaseElo,
  )

  // player1·player2 기준 delta 값
  const newD1 = input.isPlayer1Winner ? winnerDelta : loserDelta
  const newD2 = input.isPlayer1Winner ? loserDelta : winnerDelta
  const newElo1 = input.isPlayer1Winner ? newWinnerElo : newLoserElo
  const newElo2 = input.isPlayer1Winner ? newLoserElo : newWinnerElo
  const newW1 = input.isPlayer1Winner ? baseW1 + 1 : baseW1
  const newL1 = input.isPlayer1Winner ? baseL1 : baseL1 + 1
  const newW2 = input.isPlayer1Winner ? baseW2 : baseW2 + 1
  const newL2 = input.isPlayer1Winner ? baseL2 + 1 : baseL2

  // match row 업데이트
  const { error: updMatchErr } = await supabase
    .from("matches")
    .update({
      winner_id: newWinnerId,
      map_name: input.mapName,
      match_type: input.matchType,
      played_date: input.playedDate,
      player1_elo_before: baseElo1,
      player2_elo_before: baseElo2,
      player1_elo_delta: newD1,
      player2_elo_delta: newD2,
    })
    .eq("id", input.matchId)

  if (updMatchErr) {
    return { ok: false, error: updMatchErr.message }
  }

  // 선수 ELO · 전적 업데이트
  const { error: upd1 } = await supabase
    .from("members")
    .update({ elo: newElo1, wins: newW1, losses: newL1 })
    .eq("id", oldP1Id)
  const { error: upd2 } = await supabase
    .from("members")
    .update({ elo: newElo2, wins: newW2, losses: newL2 })
    .eq("id", oldP2Id)

  if (upd1 || upd2) {
    // 실패 시 match row 원복 시도
    await supabase
      .from("matches")
      .update({
        winner_id: oldWinnerId,
        map_name: row.map_name,
        match_type: row.match_type,
        played_date: row.played_date,
        player1_elo_before: row.player1_elo_before,
        player2_elo_before: row.player2_elo_before,
        player1_elo_delta: oldD1,
        player2_elo_delta: oldD2,
      })
      .eq("id", input.matchId)
    return { ok: false, error: upd1?.message ?? upd2?.message ?? "ELO 업데이트 실패" }
  }

  // streak 재계산
  const s1 = await computeStreakForMember(supabase, oldP1Id)
  const s2 = await computeStreakForMember(supabase, oldP2Id)
  await supabase.from("members").update({ streak: s1 }).eq("id", oldP1Id)
  await supabase.from("members").update({ streak: s2 }).eq("id", oldP2Id)

  const winnerName = input.isPlayer1Winner ? (m1.name as string) : (m2.name as string)
  await insertAdminLog(
    session.username,
    "전적 수정",
    `${m1.name as string}`,
    `vs ${m2.name as string} winner=${winnerName} map=${input.mapName} type=${input.matchType} date=${input.playedDate}`,
  )

  revalidatePath("/")
  revalidatePath("/admin")
  revalidatePath("/ranking")
  return { ok: true }
}
