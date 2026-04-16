import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import type { Match, Race, Tier } from "@/lib/types/tufelo"
import { mapDbRowToMatch, type DbMatchRow } from "@/lib/data/matches"
import { resolveMemberIdsByPlayerQuery } from "@/lib/resolve-member-ids-by-player-query"

export const dynamic = "force-dynamic"

const PAGE_SIZE = 50

type MemberRow = {
  id: string
  name: string
  race: Race
  tier: Tier
}

/**
 * GET /api/matches
 * 대시보드 전적 목록을 필터·페이지네이션하여 반환합니다.
 * 쿼리 파라미터: page, player1, player2, dateFrom, dateTo, map, matchType, seasonId, player1Tier
 */
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
    const player1TierRaw = searchParams.get("player1Tier")?.trim() ?? ""
    const player1TierFilter: Tier | null =
      player1TierRaw === "1" || player1TierRaw === "2" || player1TierRaw === "3" || player1TierRaw === "4"
        ? (Number(player1TierRaw) as Tier)
        : null

    const supabase = await createClient()

    // 멤버 전체 로드 (규모가 작아 가볍고, 이름→ID 매핑에 필요)
    const { data: membersData, error: membersError } = await supabase
      .from("members")
      .select("id, name, race, tier")

    if (membersError) {
      return NextResponse.json({ error: membersError.message }, { status: 500 })
    }

    const members = (membersData ?? []) as MemberRow[]
    const byId = new Map(members.map((m) => [m.id, m]))

    // 선수 이름 → ID 목록 변환 (양쪽 포지션 모두 검색)
    let player1Ids: string[] = []
    if (player1) {
      player1Ids = resolveMemberIdsByPlayerQuery(members, player1)
      if (player1Ids.length === 0) {
        return NextResponse.json({ matches: [], totalCount: 0, totalPages: 0, wins: 0, losses: 0 })
      }
    }

    let player2Ids: string[] = []
    if (player2) {
      player2Ids = resolveMemberIdsByPlayerQuery(members, player2)
      if (player2Ids.length === 0) {
        return NextResponse.json({ matches: [], totalCount: 0, totalPages: 0, wins: 0, losses: 0 })
      }
    }

    let player1IdTierFilter: string[] = []
    if (player1TierFilter !== null) {
      player1IdTierFilter = members.filter((m) => m.tier === player1TierFilter).map((m) => m.id)
      if (player1IdTierFilter.length === 0) {
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
    if (player1IdTierFilter.length > 0) {
      query = query.in("player1_id", player1IdTierFilter)
    }

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
      if (seasonId === "__none__") winsQuery = winsQuery.is("season_id", null)
      else if (seasonId) winsQuery = winsQuery.eq("season_id", seasonId)
      if (player1IdTierFilter.length > 0) {
        winsQuery = winsQuery.in("player1_id", player1IdTierFilter)
      }

      const { count: winsCount } = await winsQuery
      wins = winsCount ?? 0
      losses = totalCount - wins
    }

    // DB rows → Match 타입 변환 (공유 mapper 사용)
    const matches: Match[] = (data ?? []).map((row: DbMatchRow) =>
      mapDbRowToMatch(row, byId),
    )

    return NextResponse.json({ matches, totalCount, totalPages, wins, losses })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
