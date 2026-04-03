import { createClient } from "@/lib/supabase/server"
import type { Match, Race, Tier } from "@/lib/types/tufelo"

type MatchRow = {
  id: string
  player1_id: string
  player2_id: string
  winner_id: string
  map_name: string
  played_date: string
  player1_elo_delta: number | null
  player2_elo_delta: number | null
}

type MatchDeltaRow = Pick<
  MatchRow,
  "player1_id" | "player2_id" | "player1_elo_delta" | "player2_elo_delta"
>

export async function fetchMatchesForDashboard(): Promise<Match[]> {
  const supabase = await createClient()
  const [memRes, matchRes] = await Promise.all([
    supabase.from("members").select("id, name, race, tier"),
    supabase
      .from("matches")
      .select(
        "id, player1_id, player2_id, winner_id, map_name, played_date, player1_elo_delta, player2_elo_delta",
      )
      .order("played_date", { ascending: false })
      .order("created_at", { ascending: false }),
  ])

  if (memRes.error) throw new Error(memRes.error.message)
  if (matchRes.error) throw new Error(matchRes.error.message)

  const byId = new Map(
    (memRes.data ?? []).map((m) => [
      m.id,
      {
        name: m.name as string,
        race: m.race as Race,
        tier: m.tier as Tier,
      },
    ]),
  )

  return (matchRes.data ?? []).map((row) => {
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
      player1EloDelta: r.player1_elo_delta ?? undefined,
    } satisfies Match
  })
}

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
    if (!changeMap.has(m.player1_id) && m.player1_elo_delta != null) {
      changeMap.set(m.player1_id, m.player1_elo_delta)
    }
    if (!changeMap.has(m.player2_id) && m.player2_elo_delta != null) {
      changeMap.set(m.player2_id, m.player2_elo_delta)
    }
  }

  const rows = memRes.data ?? []
  return rows.map((r, i) => ({
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
