"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { computeEloMatch } from "@/lib/elo"
import { getClientIp } from "@/lib/request-ip"
import { computeStreakForMember } from "@/lib/match-streak"
import { isAdminFromCookies } from "@/lib/auth/admin"
import type { RegisterMatchInput } from "@/lib/types/tufelo"

const mapNamePattern = /^[가-힣]+$/

export type ActionResult = { ok: true } | { ok: false; error: string }

export async function registerMatchAction(input: RegisterMatchInput): Promise<ActionResult> {
  if (input.player1Id === input.player2Id) {
    return { ok: false, error: "같은 선수를 선택할 수 없습니다." }
  }
  if (!mapNamePattern.test(input.mapName)) {
    return { ok: false, error: "맵 이름은 띄어쓰기 없이 한글만 입력해 주세요." }
  }

  const supabase = await createClient()

  const { data: m1, error: e1 } = await supabase
    .from("members")
    .select("id, elo, wins, losses, streak")
    .eq("id", input.player1Id)
    .single()

  const { data: m2, error: e2 } = await supabase
    .from("members")
    .select("id, elo, wins, losses, streak")
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

  revalidatePath("/")
  revalidatePath("/admin")
  revalidatePath("/ranking")
  return { ok: true }
}

export async function deleteMatchAction(matchId: string): Promise<ActionResult> {
  if (!(await isAdminFromCookies())) {
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

  revalidatePath("/")
  revalidatePath("/admin")
  revalidatePath("/ranking")
  return { ok: true }
}
