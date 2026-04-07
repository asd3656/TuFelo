import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import type { Match, Race, Tier } from "@/lib/types/tufelo"

export const dynamic = "force-dynamic"

const PAGE_SIZE = 50

type MemberRow = {
  id: string
  name: string
  race: Race
  tier: Tier
}

type MatchRow = {
  id: string
  player1_id: string
  player2_id: string
  winner_id: string
  map_name: string
  played_date: string
  match_type: string | null
  player1_elo_delta: number | null
  player2_elo_delta: number | null
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10))
    const player1 = searchParams.get("player1")?.trim() ?? ""
    const player2 = searchParams.get("player2")?.trim() ?? ""
    const dateFrom = searchParams.get("dateFrom") ?? ""
    const dateTo = searchParams.get("dateTo") ?? ""
    const mapFilter = searchParams.get("map")?.trim() ?? ""
    const matchType = searchParams.get("matchType") ?? ""
    const seasonId = searchParams.get("seasonId") ?? ""  // "__none__" | UUID | ""

    const supabase = await createClient()

    // 멤버 전체 로드 (소수이므로 가볍고, 이름→ID 매핑에 필요)
    const { data: membersData, error: membersError } = await supabase
      .from("members")
      .select("id, name, race, tier")

    if (membersError) {
      return NextResponse.json({ error: membersError.message }, { status: 500 })
    }

    const members = (membersData ?? []) as MemberRow[]
    const byId = new Map(members.map((m) => [m.id, m]))

    // 선수1 이름 → ID 목록 변환
    let player1Ids: string[] = []
    if (player1) {
      player1Ids = members
        .filter((m) => m.name.toLowerCase().includes(player1.toLowerCase()))
        .map((m) => m.id)
      if (player1Ids.length === 0) {
        return NextResponse.json({ matches: [], totalCount: 0, totalPages: 0, wins: 0, losses: 0 })
      }
    }

    // 선수2 이름 → ID 목록 변환
    let player2Ids: string[] = []
    if (player2) {
      player2Ids = members
        .filter((m) => m.name.toLowerCase().includes(player2.toLowerCase()))
        .map((m) => m.id)
      if (player2Ids.length === 0) {
        return NextResponse.json({ matches: [], totalCount: 0, totalPages: 0, wins: 0, losses: 0 })
      }
    }

    const from = (page - 1) * PAGE_SIZE
    const to = from + PAGE_SIZE - 1

    // 메인 쿼리 구성
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query: any = supabase
      .from("matches")
      .select(
        "id, player1_id, player2_id, winner_id, map_name, played_date, match_type, player1_elo_delta, player2_elo_delta",
        { count: "exact" },
      )
      .order("played_date", { ascending: false })
      .order("created_at", { ascending: false })
      .range(from, to)

    // 선수 필터 적용 (양쪽 포지션 모두 검색)
    if (player1 && player2) {
      const p1 = player1Ids.join(",")
      const p2 = player2Ids.join(",")
      query = query.or(
        `and(player1_id.in.(${p1}),player2_id.in.(${p2})),and(player1_id.in.(${p2}),player2_id.in.(${p1}))`,
      )
    } else if (player1) {
      const p1 = player1Ids.join(",")
      query = query.or(`player1_id.in.(${p1}),player2_id.in.(${p1})`)
    } else if (player2) {
      const p2 = player2Ids.join(",")
      query = query.or(`player1_id.in.(${p2}),player2_id.in.(${p2})`)
    }

    if (dateFrom) query = query.gte("played_date", dateFrom)
    if (dateTo) query = query.lte("played_date", dateTo)
    if (mapFilter) query = query.ilike("map_name", `%${mapFilter}%`)
    if (matchType) query = query.eq("match_type", matchType)
    if (seasonId === "__none__") query = query.is("season_id", null)
    else if (seasonId) query = query.eq("season_id", seasonId)

    const { data, count, error } = await query

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const totalCount = count ?? 0
    const totalPages = Math.ceil(totalCount / PAGE_SIZE)

    // 선수1 검색 시 전체 승/패 수 집계 (현재 페이지가 아닌 전체 기준)
    let wins = 0
    let losses = 0
    if (player1 && player1Ids.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let winsQuery: any = supabase
        .from("matches")
        .select("id", { count: "exact", head: true })
        .in("winner_id", player1Ids)

      if (player2 && player2Ids.length > 0) {
        const p2 = player2Ids.join(",")
        winsQuery = winsQuery.or(`player1_id.in.(${p2}),player2_id.in.(${p2})`)
      }
      if (dateFrom) winsQuery = winsQuery.gte("played_date", dateFrom)
      if (dateTo) winsQuery = winsQuery.lte("played_date", dateTo)
      if (mapFilter) winsQuery = winsQuery.ilike("map_name", `%${mapFilter}%`)
      if (matchType) winsQuery = winsQuery.eq("match_type", matchType)

      const { count: winsCount } = await winsQuery
      wins = winsCount ?? 0
      losses = totalCount - wins
    }

    // DB rows → Match 타입 변환
    const matches: Match[] = (data ?? []).map((row: MatchRow) => {
      const p1 = byId.get(row.player1_id)
      const p2 = byId.get(row.player2_id)
      const w = byId.get(row.winner_id)
      return {
        id: row.id,
        player1: p1?.name ?? "?",
        player2: p2?.name ?? "?",
        player1Race: p1?.race,
        player2Race: p2?.race,
        player1Tier: p1?.tier,
        player2Tier: p2?.tier,
        winner: w?.name ?? "?",
        map: row.map_name,
        date: row.played_date,
        matchType: row.match_type ?? undefined,
        player1EloDelta: row.player1_elo_delta ?? undefined,
      } satisfies Match
    })

    return NextResponse.json({ matches, totalCount, totalPages, wins, losses })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
