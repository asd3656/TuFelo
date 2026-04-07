import { createClient } from "@/lib/supabase/server"
import type { Match, Race, Tier, MemberForRanking, MatchForRanking } from "@/lib/types/tufelo"

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

type MatchDeltaRow = Pick<
  MatchRow,
  "player1_id" | "player2_id" | "player1_elo_delta" | "player2_elo_delta"
>

const DASHBOARD_PAGE_SIZE = 50

export async function fetchInitialDashboardData(): Promise<{
  matches: Match[]
  totalCount: number
  totalPages: number
  knownMaps: string[]
  knownMatchTypes: string[]
}> {
  const supabase = await createClient()

  const [memRes, firstPageRes, metaRes] = await Promise.all([
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
    // 맵/경기유형 드롭다운용 전체 고유값 수집 (컬럼 2개만 fetch)
    supabase.from("matches").select("map_name, match_type").limit(10000),
  ])

  if (memRes.error) throw new Error(memRes.error.message)
  if (firstPageRes.error) throw new Error(firstPageRes.error.message)

  const byId = new Map(
    (memRes.data ?? []).map((m) => [
      m.id,
      { name: m.name as string, race: m.race as Race, tier: m.tier as Tier },
    ]),
  )

  const matches: Match[] = (firstPageRes.data ?? []).map((row) => {
    const r = row as MatchRow
    const p1 = byId.get(r.player1_id)
    const p2 = byId.get(r.player2_id)
    const w = byId.get(r.winner_id)
    return {
      id: r.id,
      player1: p1?.name ?? "?",
      player2: p2?.name ?? "?",
      player1Race: p1?.race,
      player2Race: p2?.race,
      player1Tier: p1?.tier,
      player2Tier: p2?.tier,
      winner: w?.name ?? "?",
      map: r.map_name,
      date: r.played_date,
      matchType: r.match_type ?? undefined,
      player1EloDelta: r.player1_elo_delta ?? undefined,
    } satisfies Match
  })

  const totalCount = firstPageRes.count ?? 0
  const totalPages = Math.ceil(totalCount / DASHBOARD_PAGE_SIZE)

  const metaRows = metaRes.data ?? []
  const knownMaps = Array.from(
    new Set(metaRows.map((r) => r.map_name as string | null).filter(Boolean)),
  ).sort() as string[]
  const knownMatchTypes = Array.from(
    new Set(metaRows.map((r) => r.match_type as string | null).filter(Boolean)),
  ).sort() as string[]

  return { matches, totalCount, totalPages, knownMaps, knownMatchTypes }
}

/** @deprecated fetchInitialDashboardData() 로 교체됨. 레거시 호환용으로만 유지. */
export async function fetchMatchesForDashboard(): Promise<Match[]> {
  const { matches } = await fetchInitialDashboardData()
  return matches
}

/** 랭킹 페이지용: 멤버 원본 + 경기 원본을 반환해 클라이언트에서 필터링·집계. */
export async function fetchRankingData(): Promise<{
  members: MemberForRanking[]
  matches: MatchForRanking[]
}> {
  const supabase = await createClient()
  const [memRes, matchRes] = await Promise.all([
    supabase
      .from("members")
      .select("id, name, race, tier, elo, wins, losses, streak")
      .eq("is_active", true)
      .order("elo", { ascending: false }),
    supabase
      .from("matches")
      .select(
        "id, player1_id, player2_id, winner_id, match_type, player1_elo_delta, player2_elo_delta, played_date, created_at",
      )
      .order("played_date", { ascending: false })
      .order("created_at", { ascending: false }),
  ])

  if (memRes.error) throw new Error(memRes.error.message)
  if (matchRes.error) throw new Error(matchRes.error.message)

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

  const matches: MatchForRanking[] = (matchRes.data ?? []).map((r) => ({
    id: r.id as string,
    player1Id: r.player1_id as string,
    player2Id: r.player2_id as string,
    winnerId: r.winner_id as string,
    matchType: (r.match_type as string | null) ?? "",
    player1EloDelta: r.player1_elo_delta as number | null,
    player2EloDelta: r.player2_elo_delta as number | null,
    playedDate: r.played_date as string,
    createdAt: r.created_at as string,
  }))

  return { members, matches }
}

/** 레거시 호환: 기존 코드가 참조하는 경우를 위해 남겨둠 */
export async function fetchRankingPlayers(): Promise<
  Array<{
    id: string
    rank: number
    name: string
    race: Race
    elo: number
    change: number
    wins: number
    losses: number
    streak: number
  }>
> {
  const supabase = await createClient()
  const [memRes, matchRes] = await Promise.all([
    supabase
      .from("members")
      .select("id, name, race, tier, elo, wins, losses, streak")
      .order("elo", { ascending: false }),
    supabase
      .from("matches")
      .select("player1_id, player2_id, player1_elo_delta, player2_elo_delta, played_date, created_at")
      .order("played_date", { ascending: false })
      .order("created_at", { ascending: false }),
  ])

  if (memRes.error) throw new Error(memRes.error.message)
  if (matchRes.error) throw new Error(matchRes.error.message)

  const matchRows = (matchRes.data ?? []) as MatchDeltaRow[]
  const changeMap = new Map<string, number>()
  for (const m of matchRows) {
    if (!changeMap.has(m.player1_id) && m.player1_elo_delta != null)
      changeMap.set(m.player1_id, m.player1_elo_delta)
    if (!changeMap.has(m.player2_id) && m.player2_elo_delta != null)
      changeMap.set(m.player2_id, m.player2_elo_delta)
  }

  return (memRes.data ?? []).map((r, i) => ({
    id: r.id as string,
    rank: i + 1,
    name: r.name as string,
    race: r.race as Race,
    elo: r.elo as number,
    change: changeMap.get(r.id as string) ?? 0,
    wins: r.wins as number,
    losses: r.losses as number,
    streak: r.streak as number,
  }))
}
