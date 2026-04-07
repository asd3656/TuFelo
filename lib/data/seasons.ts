import { createClient } from "@/lib/supabase/server"
import type { Season, SeasonRankingEntry, Race, Tier } from "@/lib/types/tufelo"

export async function fetchSeasons(): Promise<Season[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("seasons")
    .select("id, name, start_date, end_date, created_at")
    .order("start_date", { ascending: false })
  if (error) return []   // 테이블 미생성 시 빈 배열 반환
  return (data ?? []).map((r) => ({
    id: r.id as string,
    name: r.name as string,
    startDate: r.start_date as string,
    endDate: (r.end_date as string | null) ?? null,
    createdAt: r.created_at as string,
  }))
}

export async function fetchActiveSeason(): Promise<Season | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("seasons")
    .select("id, name, start_date, end_date, created_at")
    .is("end_date", null)
    .maybeSingle()
  if (error || !data) return null
  return {
    id: data.id as string,
    name: data.name as string,
    startDate: data.start_date as string,
    endDate: null,
    createdAt: data.created_at as string,
  }
}

export async function fetchAllSeasonRankings(): Promise<Record<string, SeasonRankingEntry[]>> {
  const supabase = await createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await supabase
    .from("season_rankings")
    .select("id, season_id, member_id, final_elo, final_wins, final_losses, rank, members(name, race, tier)")
    .order("rank", { ascending: true })
  if (error) return {}   // 테이블 미생성 시 빈 객체 반환

  const result: Record<string, SeasonRankingEntry[]> = {}
  for (const r of data ?? []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mem = (r as any).members as { name: string; race: Race; tier: Tier } | null
    const entry: SeasonRankingEntry = {
      id: r.id as string,
      seasonId: r.season_id as string,
      memberId: r.member_id as string,
      memberName: mem?.name ?? "?",
      memberRace: mem?.race ?? "T",
      memberTier: (mem?.tier ?? 4) as Tier,
      finalElo: r.final_elo as number,
      finalWins: r.final_wins as number,
      finalLosses: r.final_losses as number,
      rank: r.rank as number,
    }
    if (!result[entry.seasonId]) result[entry.seasonId] = []
    result[entry.seasonId].push(entry)
  }
  return result
}
