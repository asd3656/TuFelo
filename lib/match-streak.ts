import type { SupabaseClient } from "@supabase/supabase-js"

type MatchStreakRow = {
  player1_id: string
  player2_id: string
  winner_id: string
  played_date: string
  created_at: string
}

/**
 * DB에 남은 경기만으로 최신 경기부터 연속 승(+) / 연패(-) 계산.
 * seasonId를 전달하면 해당 시즌 경기만 대상으로 계산.
 */
export async function computeStreakForMember(
  supabase: SupabaseClient,
  memberId: string,
  seasonId?: string | null,
): Promise<number> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = supabase
    .from("matches")
    .select("player1_id, player2_id, winner_id, played_date, created_at")
    .or(`player1_id.eq.${memberId},player2_id.eq.${memberId}`)
    .order("played_date", { ascending: false })
    .order("created_at", { ascending: false })

  if (seasonId !== undefined) {
    query = seasonId === null
      ? query.is("season_id", null)
      : query.eq("season_id", seasonId)
  }

  const { data, error } = await query

  if (error || !data?.length) return 0

  let streak = 0
  for (const row of data as MatchStreakRow[]) {
    const won = row.winner_id === memberId
    if (streak === 0) {
      streak = won ? 1 : -1
    } else if (streak > 0 && won) {
      streak += 1
    } else if (streak < 0 && !won) {
      streak -= 1
    } else {
      break
    }
  }
  return streak
}

/** 메모리 내 경기 목록(최신순)으로 연속 승패 계산 */
export function computeStreakFromMatchList(
  memberId: string,
  matchesDescOrder: Array<{ player1_id: string; player2_id: string; winner_id: string }>,
): number {
  let streak = 0
  for (const m of matchesDescOrder) {
    const involved = m.player1_id === memberId || m.player2_id === memberId
    if (!involved) continue
    const won = m.winner_id === memberId
    if (streak === 0) streak = won ? 1 : -1
    else if (streak > 0 && won) streak++
    else if (streak < 0 && !won) streak--
    else break
  }
  return streak
}
