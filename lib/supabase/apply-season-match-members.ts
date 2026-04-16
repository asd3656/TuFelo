import type { SupabaseClient } from "@supabase/supabase-js"

/** Atomically increment wins/losses in DB (avoids lost updates under concurrent registrations). */
export async function applySeasonMatchMemberUpdatesRpc(
  supabase: SupabaseClient,
  params: {
    winnerId: string
    loserId: string
    winnerElo: number
    loserElo: number
    winnerStreak: number
    loserStreak: number
  },
): Promise<{ error: { message: string } | null }> {
  const { error } = await supabase.rpc("apply_season_match_member_updates", {
    p_winner_id: params.winnerId,
    p_loser_id: params.loserId,
    p_winner_elo: params.winnerElo,
    p_loser_elo: params.loserElo,
    p_winner_streak: params.winnerStreak,
    p_loser_streak: params.loserStreak,
  })
  return { error }
}

/** Atomically subtract elo deltas and one win/loss each (undo one season match on members). */
export async function applySeasonMatchUndoStatsRpc(
  supabase: SupabaseClient,
  params: {
    player1Id: string
    player2Id: string
    winnerId: string
    player1EloDelta: number
    player2EloDelta: number
  },
): Promise<{ error: { message: string } | null }> {
  const { error } = await supabase.rpc("apply_season_match_undo_stats", {
    p_player1_id: params.player1Id,
    p_player2_id: params.player2Id,
    p_winner_id: params.winnerId,
    p_delta1: params.player1EloDelta,
    p_delta2: params.player2EloDelta,
  })
  return { error }
}
