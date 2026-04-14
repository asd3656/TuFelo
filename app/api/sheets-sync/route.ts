import { type NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/service"
import { computeEloMatch } from "@/lib/elo"
import { computeStreakForMember } from "@/lib/match-streak"
import { insertAdminLog } from "@/lib/admin-log"

export const dynamic = "force-dynamic"

const mapNamePattern = /^[가-힣]+$/

async function getActiveSeason(supabase: ReturnType<typeof createServiceClient>) {
  const { data } = await supabase
    .from("seasons")
    .select("id, start_date")
    .is("end_date", null)
    .maybeSingle()
  return data as { id: string; start_date: string } | null
}

export async function POST(req: NextRequest) {
  try {
    // 1. 시크릿 토큰 인증
    const secret = process.env.SHEETS_SYNC_SECRET
    const authHeader = req.headers.get("authorization")
    if (!secret || authHeader !== `Bearer ${secret}`) {
      return NextResponse.json({ ok: false, error: "인증 실패" }, { status: 401 })
    }

    // 2. 요청 데이터 파싱
    const body = await req.json()
    const {
      player1Name,
      player2Name,
      player1Result,
      mapName,
      matchType,
      played_date: playedDateRaw,
    }: {
      player1Name: string
      player2Name: string
      player1Result: "승" | "패"
      mapName: string
      matchType: string
      played_date?: string
    } = body

    if (!player1Name?.trim()) return NextResponse.json({ ok: false, error: "닉네임(나) 누락" }, { status: 400 })
    if (!player2Name?.trim()) return NextResponse.json({ ok: false, error: "상대 닉네임 누락" }, { status: 400 })
    if (player1Result !== "승" && player1Result !== "패")
      return NextResponse.json({ ok: false, error: `결과 값 오류: "${player1Result}" (승 또는 패만 가능)` }, { status: 400 })
    if (!mapName?.trim()) return NextResponse.json({ ok: false, error: "맵 이름 누락" }, { status: 400 })
    if (!mapNamePattern.test(mapName.trim()))
      return NextResponse.json({ ok: false, error: `맵 이름 오류: "${mapName}" (한글만, 띄어쓰기 없이)` }, { status: 400 })
    if (!matchType?.trim()) return NextResponse.json({ ok: false, error: "경기 유형 누락" }, { status: 400 })

    const supabase = createServiceClient()

    // 3. 선수 조회 (대소문자 무시)
    const { data: m1, error: e1 } = await supabase
      .from("members")
      .select("id, name, elo, wins, losses, streak")
      .ilike("name", player1Name.trim())
      .maybeSingle()

    const { data: m2, error: e2 } = await supabase
      .from("members")
      .select("id, name, elo, wins, losses, streak")
      .ilike("name", player2Name.trim())
      .maybeSingle()

    if (e1 || !m1)
      return NextResponse.json({ ok: false, error: `선수를 찾을 수 없음: "${player1Name}"` }, { status: 400 })
    if (e2 || !m2)
      return NextResponse.json({ ok: false, error: `선수를 찾을 수 없음: "${player2Name}"` }, { status: 400 })
    if (m1.id === m2.id)
      return NextResponse.json({ ok: false, error: "같은 선수를 선택할 수 없습니다" }, { status: 400 })

    const isPlayer1Winner = player1Result === "승"
    const winnerId = isPlayer1Winner ? (m1.id as string) : (m2.id as string)

    // 4. 활성 시즌 확인 — 경기 입력 시점 날짜 기준 (없으면 승인 시점 사용)
    const today = playedDateRaw
      ? playedDateRaw.slice(0, 10) // "yyyy-MM-dd HH:mm:ss" → "yyyy-MM-dd"
      : new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" }) // YYYY-MM-DD
    const activeSeason = await getActiveSeason(supabase)
    const isSeasonMatch = activeSeason !== null && today >= activeSeason.start_date
    const seasonId = isSeasonMatch ? activeSeason!.id : null

    const elo1 = m1.elo as number
    const elo2 = m2.elo as number
    const wins1 = m1.wins as number
    const losses1 = m1.losses as number
    const wins2 = m2.wins as number
    const losses2 = m2.losses as number
    const streak1 = m1.streak as number
    const streak2 = m2.streak as number

    if (isSeasonMatch) {
      // 5a. 시즌 경기: ELO 계산 + 선수 스탯 업데이트
      const winnerBaseElo = isPlayer1Winner ? elo1 : elo2
      const loserBaseElo = isPlayer1Winner ? elo2 : elo1
      const { newWinnerElo, newLoserElo, winnerDelta, loserDelta } = computeEloMatch(winnerBaseElo, loserBaseElo)

      const delta1 = isPlayer1Winner ? winnerDelta : loserDelta
      const delta2 = isPlayer1Winner ? loserDelta : winnerDelta
      const newElo1 = isPlayer1Winner ? newWinnerElo : newLoserElo
      const newElo2 = isPlayer1Winner ? newLoserElo : newWinnerElo

      const nextStreak1 = isPlayer1Winner ? (streak1 > 0 ? streak1 + 1 : 1) : (streak1 < 0 ? streak1 - 1 : -1)
      const nextStreak2 = isPlayer1Winner ? (streak2 < 0 ? streak2 - 1 : -1) : (streak2 > 0 ? streak2 + 1 : 1)

      const { data: inserted, error: insErr } = await supabase
        .from("matches")
        .insert({
          player1_id: m1.id,
          player2_id: m2.id,
          winner_id: winnerId,
          map_name: mapName.trim(),
          match_type: matchType.trim(),
          played_date: today,
          season_id: seasonId,
          player1_elo_before: elo1,
          player2_elo_before: elo2,
          player1_elo_delta: delta1,
          player2_elo_delta: delta2,
        })
        .select("id")
        .single()

      if (insErr)
        return NextResponse.json({ ok: false, error: `DB 저장 실패: ${insErr.message}` }, { status: 500 })

      const matchId = inserted?.id as string

      const { error: u1 } = await supabase
        .from("members")
        .update({
          elo: newElo1,
          wins: isPlayer1Winner ? wins1 + 1 : wins1,
          losses: isPlayer1Winner ? losses1 : losses1 + 1,
          streak: nextStreak1,
        })
        .eq("id", m1.id)

      const { error: u2 } = await supabase
        .from("members")
        .update({
          elo: newElo2,
          wins: isPlayer1Winner ? wins2 : wins2 + 1,
          losses: isPlayer1Winner ? losses2 + 1 : losses2,
          streak: nextStreak2,
        })
        .eq("id", m2.id)

      if (u1 || u2) {
        await supabase.from("matches").delete().eq("id", matchId)
        return NextResponse.json(
          { ok: false, error: u1?.message ?? u2?.message ?? "ELO 업데이트 실패" },
          { status: 500 },
        )
      }

      // streak 재계산 (정확도 향상)
      const s1 = await computeStreakForMember(supabase, m1.id as string, seasonId)
      const s2 = await computeStreakForMember(supabase, m2.id as string, seasonId)
      await supabase.from("members").update({ streak: s1 }).eq("id", m1.id)
      await supabase.from("members").update({ streak: s2 }).eq("id", m2.id)
    } else {
      // 5b. 비시즌 경기: ELO 계산 없이 기록만 저장
      const { error: insErr } = await supabase.from("matches").insert({
        player1_id: m1.id,
        player2_id: m2.id,
        winner_id: winnerId,
        map_name: mapName.trim(),
        match_type: matchType.trim(),
        played_date: today,
        season_id: null,
        player1_elo_before: null,
        player2_elo_before: null,
        player1_elo_delta: null,
        player2_elo_delta: null,
      })

      if (insErr)
        return NextResponse.json({ ok: false, error: `DB 저장 실패: ${insErr.message}` }, { status: 500 })
    }

    await insertAdminLog(
      "시트연동",
      "전적 등록",
      m1.name as string,
      `vs ${m2.name as string} | 승자=${isPlayer1Winner ? m1.name : m2.name} | 맵=${mapName} | 유형=${matchType} | 날짜=${today} | 시즌=${seasonId ?? "비시즌"}`,
    )

    return NextResponse.json({
      ok: true,
      message: `✅ ${m1.name as string} vs ${m2.name as string} 등록완료 (${today})`,
    })
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 })
  }
}
