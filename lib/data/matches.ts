import { createClient } from "@/lib/supabase/server"
import type { Match, Race, Tier, MemberForRanking, MatchForRanking, Season, SeasonRankingEntry } from "@/lib/types/tufelo"
import { fetchSeasons, fetchAllSeasonRankings } from "@/lib/data/seasons"

/** Supabase matches 테이블의 원시 행 타입 */
export type DbMatchRow = {
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

type MemberLookup = { name: string; race: Race; tier: Tier }

/**
 * DB 행과 멤버 조회 맵을 받아 Match 도메인 객체로 변환합니다.
 * dashboard와 /api/matches 양쪽에서 공통으로 사용합니다.
 */
export function mapDbRowToMatch(
  row: DbMatchRow,
  byId: Map<string, MemberLookup>,
): Match {
  const p1 = byId.get(row.player1_id)
  const p2 = byId.get(row.player2_id)
  const w = byId.get(row.winner_id)
  return {
    id: row.id,
    player1Id: row.player1_id,
    player2Id: row.player2_id,
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
    player2EloDelta: row.player2_elo_delta ?? undefined,
  } satisfies Match
}

const DASHBOARD_PAGE_SIZE = 50

type MatchMetaRow = { map_name: string | null; match_type: string | null }

/**
 * 맵/경기유형 드롭다운용 고유값.
 * 우선 Supabase RPC `get_distinct_match_meta` (DB에서 DISTINCT) 사용, 실패 시 구 방식 폴백.
 */
async function fetchDistinctMatchMeta(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<MatchMetaRow[]> {
  const { data, error } = await supabase.rpc("get_distinct_match_meta")
  if (!error && data != null) {
    return data as MatchMetaRow[]
  }
  const { data: fb, error: fbErr } = await supabase
    .from("matches")
    .select("map_name, match_type")
    .limit(10000)
  if (fbErr) throw new Error(fbErr.message)
  return (fb ?? []) as MatchMetaRow[]
}

/**
 * 대시보드 초기 데이터 페치.
 * - 1페이지 경기 목록 (최신순 50건)
 * - 전체 경기 수 및 총 페이지 수
 * - 맵/경기유형 드롭다운용 고유값 (RPC `get_distinct_match_meta` 권장)
 */
export async function fetchInitialDashboardData(): Promise<{
  matches: Match[]
  totalCount: number
  totalPages: number
  knownMaps: string[]
  knownMatchTypes: string[]
}> {
  const supabase = await createClient()

  const [memRes, firstPageRes, metaRows] = await Promise.all([
    supabase.from("members").select("id, name, race, tier"),
    supabase
      .from("matches")
      .select(
        "id, player1_id, player2_id, winner_id, map_name, played_date, match_type, player1_elo_delta, player2_elo_delta",
        { count: "exact" },
      )
      .order("played_date", { ascending: false })
      .order("created_at", { ascending: false })
      .range(0, DASHBOARD_PAGE_SIZE - 1),
    fetchDistinctMatchMeta(supabase),
  ])

  if (memRes.error) throw new Error(memRes.error.message)
  if (firstPageRes.error) throw new Error(firstPageRes.error.message)

  const byId = new Map(
    (memRes.data ?? []).map((m) => [
      m.id,
      { name: m.name as string, race: m.race as Race, tier: m.tier as Tier },
    ]),
  )

  const matches: Match[] = (firstPageRes.data ?? []).map((row) =>
    mapDbRowToMatch(row as DbMatchRow, byId),
  )

  const totalCount = firstPageRes.count ?? 0
  const totalPages = Math.ceil(totalCount / DASHBOARD_PAGE_SIZE)

  const knownMaps = Array.from(
    new Set(metaRows.map((r) => r.map_name).filter(Boolean)),
  ).sort() as string[]
  const knownMatchTypes = Array.from(
    new Set(metaRows.map((r) => r.match_type).filter(Boolean)),
  ).sort() as string[]

  return { matches, totalCount, totalPages, knownMaps, knownMatchTypes }
}

/**
 * 랭킹 페이지용: 멤버 원본 + 현재 시즌 경기 + 시즌 목록 + 과거 시즌 스냅샷 반환.
 */
export async function fetchRankingData(): Promise<{
  members: MemberForRanking[]
  matches: MatchForRanking[]
  seasons: Season[]
  currentSeason: Season | null
  pastSeasonRankings: Record<string, SeasonRankingEntry[]>
}> {
  const supabase = await createClient()

  // 현재 활성 시즌 ID 조회
  const { data: activeSeasonRow } = await supabase
    .from("seasons")
    .select("id")
    .is("end_date", null)
    .maybeSingle()
  const activeSeasonId = (activeSeasonRow?.id as string | null) ?? null

  const [memRes, matchRes, seasons, pastSeasonRankings] = await Promise.all([
    supabase
      .from("members")
      .select("id, name, race, tier, elo, wins, losses, streak")
      .eq("is_active", true)
      .order("elo", { ascending: false }),
    // 현재 시즌 경기만 조회 (랭킹 최근 변동 계산용)
    activeSeasonId
      ? supabase
          .from("matches")
          .select("id, player1_id, player2_id, winner_id, match_type, player1_elo_delta, player2_elo_delta, played_date, created_at, season_id")
          .eq("season_id", activeSeasonId)
          .order("played_date", { ascending: false })
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    fetchSeasons(),
    fetchAllSeasonRankings(),
  ])

  if (memRes.error) throw new Error(memRes.error.message)

  const members: MemberForRanking[] = (memRes.data ?? []).map((r) => ({
    id: r.id as string,
    name: r.name as string,
    race: r.race as Race,
    tier: r.tier as Tier,
    elo: r.elo as number,
    wins: r.wins as number,
    losses: r.losses as number,
    streak: r.streak as number,
  }))

  const matchData = (matchRes as { data: unknown[] | null }).data ?? []
  const matches: MatchForRanking[] = matchData.map((r) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = r as any
    return {
      id: row.id as string,
      player1Id: row.player1_id as string,
      player2Id: row.player2_id as string,
      winnerId: row.winner_id as string,
      matchType: (row.match_type as string | null) ?? "",
      player1EloDelta: row.player1_elo_delta as number | null,
      player2EloDelta: row.player2_elo_delta as number | null,
      playedDate: row.played_date as string,
      createdAt: row.created_at as string,
      seasonId: (row.season_id as string | null) ?? null,
    }
  })

  const currentSeason = seasons.find((s) => s.endDate === null) ?? null

  return { members, matches, seasons, currentSeason, pastSeasonRankings }
}
