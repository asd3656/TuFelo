import type { SupabaseClient } from "@supabase/supabase-js"

type MatchStreakRow = {
  player1_id: string
  player2_id: string
  winner_id: string
  played_date: string
  created_at: string
}

/** DB에 남은 경기만으로 최신 경기부터 연속 승(+) / 연패(-) 계산 */
export async function computeStreakForMember(
  supabase: SupabaseClient,
  memberId: string,
): Promise<number> {
  const { data, error } = await supabase
    .from("matches")
    .select("player1_id, player2_id, winner_id, played_date, created_at")
    .or(`player1_id.eq.${memberId},player2_id.eq.${memberId}`)
    .order("played_date", { ascending: false })
    .order("created_at", { ascending: false })

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
