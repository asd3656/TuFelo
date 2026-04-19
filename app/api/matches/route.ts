import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import type { Match, Race, Tier } from "@/lib/types/tufelo"
import { mapDbRowToMatch, type DbMatchRow } from "@/lib/data/matches"
import { resolveMemberIdsByPlayerQuery } from "@/lib/resolve-member-ids-by-player-query"

export const dynamic = "force-dynamic"

const PAGE_SIZE = 50

/** 대시보드 시즌 필터용 가상 ID — `seasons` 테이블 행과 구분 */
const SEASON_FILTER_TFPL_S1 = "__tfpl_s1__"
const SEASON_FILTER_TFPL_S2 = "__tfpl_s2__"

type MemberRow = {
  id: string
  name: string
  race: Race
  tier: Tier
}

/**
 * 시즌 필터: DB 시즌 UUID + 경기유형 TFPL_S1/S2(시즌1·2) 를 OR 로 결합
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applySeasonIdsFilter(query: any, seasonIds: string[]) {
  if (seasonIds.length === 0) return query

  const uuidSeasonIds = seasonIds.filter(
    (id) => id !== SEASON_FILTER_TFPL_S1 && id !== SEASON_FILTER_TFPL_S2,
  )

  const onlyDbSeasons =
    seasonIds.length > 0 &&
    seasonIds.every(
      (id) => id !== SEASON_FILTER_TFPL_S1 && id !== SEASON_FILTER_TFPL_S2,
    )

  if (onlyDbSeasons) {
    if (uuidSeasonIds.length === 1) return query.eq("season_id", uuidSeasonIds[0])
    return query.in("season_id", uuidSeasonIds)
  }

  const branches: string[] = []
  if (seasonIds.includes(SEASON_FILTER_TFPL_S1)) {
    branches.push("match_type.eq.TFPL_S1")
  }
  if (seasonIds.includes(SEASON_FILTER_TFPL_S2)) {
    branches.push("match_type.eq.TFPL_S2")
  }
  for (const id of uuidSeasonIds) {
    branches.push(`season_id.eq.${id}`)
  }

  if (branches.length === 0) return query
  return branches.length === 1 ? query.or(branches[0]) : query.or(branches.join(","))
}

/**
 * GET /api/matches
 * 대시보드 전적 목록을 필터·페이지네이션하여 반환합니다.
 * 쿼리 파라미터: page, player1, player2, dateFrom, dateTo, map,
 * matchType(복수 가능), seasonId(복수 가능), player1Tier(복수 가능)
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
    const matchTypes = Array.from(
      new Set(
        searchParams
          .getAll("matchType")
          .map((v) => v.trim())
          .filter(Boolean),
      ),
    )
    const seasonIds = Array.from(
      new Set(
        searchParams
          .getAll("seasonId")
          .map((v) => v.trim())
          .filter(Boolean),
      ),
    )
    const player1Tiers = Array.from(
      new Set(
        searchParams
          .getAll("player1Tier")
          .map((v) => v.trim())
          .filter((v): v is "1" | "2" | "3" | "4" => v === "1" || v === "2" || v === "3" || v === "4"),
      ),
    )

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
    if (player1Tiers.length > 0) {
      const tierSet = new Set(player1Tiers.map((v) => Number(v) as Tier))
      player1IdTierFilter = members.filter((m) => tierSet.has(m.tier)).map((m) => m.id)
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
    if (matchTypes.length > 0) query = query.in("match_type", matchTypes)
    if (seasonIds.length > 0) {
      query = applySeasonIdsFilter(query, seasonIds)
    }
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
      if (matchTypes.length > 0) winsQuery = winsQuery.in("match_type", matchTypes)
      if (seasonIds.length > 0) {
        winsQuery = applySeasonIdsFilter(winsQuery, seasonIds)
      }
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
