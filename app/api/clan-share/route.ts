import { type NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/service"
import { computeEloMatch } from "@/lib/elo"

export const dynamic = "force-dynamic"

function checkApiKey(req: NextRequest) {
  const authHeader = req.headers.get("authorization") ?? ""
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : authHeader
  return token === process.env.CLAN_API_KEY
}

/**
 * POST /api/clan-share
 * 클랜원 사이트에서 경기 1건을 전송하면 matches 테이블에 직접 저장.
 * 기존 registerMatchAction과 동일하게 ELO·승패·스트릭을 반영합니다.
 *
 * Headers:
 *   Authorization: Bearer <CLAN_API_KEY>
 *
 * Body (JSON):
 *   {
 *     player1: string,      // 선수1 닉네임
 *     player2: string,      // 선수2 닉네임
 *     winner: string,       // 승자 닉네임 (player1 또는 player2와 동일해야 함)
 *     map: string,          // 맵 이름
 *     matchType: string,    // 경기 유형 (예: "친선", "팀매배" 등)
 *     playedDate: string    // 경기 날짜 (YYYY-MM-DD)
 *   }
 */
export async function POST(req: NextRequest) {
  if (!checkApiKey(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const { player1, player2, winner, map, matchType, playedDate } = body as Record<string, unknown>

  if (!player1 || typeof player1 !== "string")
    return NextResponse.json({ error: "player1 필드가 필요합니다" }, { status: 400 })
  if (!player2 || typeof player2 !== "string")
    return NextResponse.json({ error: "player2 필드가 필요합니다" }, { status: 400 })
  if (!winner || typeof winner !== "string")
    return NextResponse.json({ error: "winner 필드가 필요합니다" }, { status: 400 })
  if (!map || typeof map !== "string")
    return NextResponse.json({ error: "map 필드가 필요합니다" }, { status: 400 })
  if (!matchType || typeof matchType !== "string")
    return NextResponse.json({ error: "matchType 필드가 필요합니다" }, { status: 400 })
  if (!playedDate || typeof playedDate !== "string")
    return NextResponse.json({ error: "playedDate 필드가 필요합니다 (YYYY-MM-DD)" }, { status: 400 })

  const winnerName = winner.trim()
  const p1Name = player1.trim()
  const p2Name = player2.trim()

  if (winnerName !== p1Name && winnerName !== p2Name) {
    return NextResponse.json(
      { error: `winner(${winnerName})가 player1(${p1Name}) 또는 player2(${p2Name})와 일치해야 합니다` },
      { status: 400 },
    )
  }

  const supabase = createServiceClient()

  // 닉네임으로 members 조회 (대소문자 무시, ELO·승패·스트릭 포함)
  const { data: members, error: membersError } = await supabase
    .from("members")
    .select("id, name, elo, wins, losses, streak")
    .or(`name.ilike.${p1Name},name.ilike.${p2Name}`)

  if (membersError) {
    return NextResponse.json({ error: membersError.message }, { status: 500 })
  }

  const memberMap = new Map((members ?? []).map((m) => [m.name.toLowerCase(), m]))

  const notFound: string[] = []
  if (!memberMap.has(p1Name.toLowerCase())) notFound.push(p1Name)
  if (!memberMap.has(p2Name.toLowerCase())) notFound.push(p2Name)

  if (notFound.length > 0) {
    return NextResponse.json(
      { error: `members 테이블에 등록되지 않은 닉네임: ${notFound.join(", ")}` },
      { status: 404 },
    )
  }

  const mWinner = memberMap.get(winnerName.toLowerCase())!
  const loserName = winnerName.toLowerCase() === p1Name.toLowerCase() ? p2Name : p1Name
  const mLoser = memberMap.get(loserName.toLowerCase())!

  // 기존 코드와 동일하게 player1 = 항상 승자, player2 = 항상 패자
  const winnerId = mWinner.id as string
  const loserId = mLoser.id as string
  const mapName = map.trim()
  const isTeamPlay = mapName.includes("팀플")

  // 활성 시즌 확인
  const { data: activeSeason } = await supabase
    .from("seasons")
    .select("id, start_date")
    .is("end_date", null)
    .maybeSingle()

  const isSeasonMatch = activeSeason !== null && playedDate.trim() >= activeSeason.start_date
  const seasonId = isSeasonMatch ? activeSeason!.id : null

  if (isSeasonMatch && !isTeamPlay) {
    // 시즌 경기: ELO 계산 + 선수 스탯 업데이트
    const elo1 = mWinner.elo as number
    const elo2 = mLoser.elo as number
    const { newWinnerElo, newLoserElo, winnerDelta, loserDelta } = computeEloMatch(elo1, elo2)

    const nextStreakWinner = (mWinner.streak as number) > 0 ? (mWinner.streak as number) + 1 : 1
    const nextStreakLoser = (mLoser.streak as number) < 0 ? (mLoser.streak as number) - 1 : -1

    const { data: inserted, error: insErr } = await supabase
      .from("matches")
      .insert({
        player1_id: winnerId,
        player2_id: loserId,
        winner_id: winnerId,
        map_name: mapName,
        match_type: matchType.trim(),
        played_date: playedDate.trim(),
        season_id: seasonId,
        player1_elo_before: elo1,
        player2_elo_before: elo2,
        player1_elo_delta: winnerDelta,
        player2_elo_delta: loserDelta,
      })
      .select("id")
      .single()

    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })

    const matchId = inserted?.id as string

    const { error: u1 } = await supabase
      .from("members")
      .update({ elo: newWinnerElo, wins: (mWinner.wins as number) + 1, streak: nextStreakWinner })
      .eq("id", winnerId)

    const { error: u2 } = await supabase
      .from("members")
      .update({ elo: newLoserElo, losses: (mLoser.losses as number) + 1, streak: nextStreakLoser })
      .eq("id", loserId)

    if (u1 || u2) {
      await supabase.from("matches").delete().eq("id", matchId)
      return NextResponse.json({ error: u1?.message ?? u2?.message ?? "ELO 업데이트 실패" }, { status: 500 })
    }
  } else if (isSeasonMatch && isTeamPlay) {
    // 팀플 시즌 경기: 승패·스트릭 업데이트, ELO 미반영
    const nextStreakWinner = (mWinner.streak as number) > 0 ? (mWinner.streak as number) + 1 : 1
    const nextStreakLoser = (mLoser.streak as number) < 0 ? (mLoser.streak as number) - 1 : -1

    const { data: inserted, error: insErr } = await supabase
      .from("matches")
      .insert({
        player1_id: winnerId,
        player2_id: loserId,
        winner_id: winnerId,
        map_name: mapName,
        match_type: matchType.trim(),
        played_date: playedDate.trim(),
        season_id: seasonId,
        player1_elo_before: null,
        player2_elo_before: null,
        player1_elo_delta: null,
        player2_elo_delta: null,
      })
      .select("id")
      .single()

    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })

    const matchId = inserted?.id as string

    const { error: u1 } = await supabase
      .from("members")
      .update({ wins: (mWinner.wins as number) + 1, streak: nextStreakWinner })
      .eq("id", winnerId)

    const { error: u2 } = await supabase
      .from("members")
      .update({ losses: (mLoser.losses as number) + 1, streak: nextStreakLoser })
      .eq("id", loserId)

    if (u1 || u2) {
      await supabase.from("matches").delete().eq("id", matchId)
      return NextResponse.json({ error: u1?.message ?? u2?.message ?? "스탯 업데이트 실패" }, { status: 500 })
    }
  } else {
    // 비시즌 경기: 경기 기록만 저장, 스탯 변경 없음
    const { error: insErr } = await supabase
      .from("matches")
      .insert({
        player1_id: winnerId,
        player2_id: loserId,
        winner_id: winnerId,
        map_name: mapName,
        match_type: matchType.trim(),
        played_date: playedDate.trim(),
        season_id: null,
        player1_elo_before: null,
        player2_elo_before: null,
        player1_elo_delta: null,
        player2_elo_delta: null,
      })

    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
