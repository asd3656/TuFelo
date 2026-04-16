-- ============================================================
-- Atomic season-match member updates (race-safe wins/losses).
--
-- Run in Supabase: Dashboard -> SQL Editor -> New query ->
-- paste this entire file -> Run. Safe to re-run (CREATE OR REPLACE).
-- Only server code with service_role should call these RPCs.
-- ============================================================

CREATE OR REPLACE FUNCTION public.apply_season_match_member_updates(
  p_winner_id uuid,
  p_loser_id uuid,
  p_winner_elo integer,
  p_loser_elo integer,
  p_winner_streak integer,
  p_loser_streak integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n int;
BEGIN
  IF p_winner_id = p_loser_id THEN
    RAISE EXCEPTION 'winner and loser must differ';
  END IF;

  UPDATE public.members
  SET
    elo = p_winner_elo,
    wins = wins + 1,
    streak = p_winner_streak
  WHERE id = p_winner_id;

  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 0 THEN
    RAISE EXCEPTION 'winner member not found: %', p_winner_id;
  END IF;

  UPDATE public.members
  SET
    elo = p_loser_elo,
    losses = losses + 1,
    streak = p_loser_streak
  WHERE id = p_loser_id;

  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 0 THEN
    RAISE EXCEPTION 'loser member not found: %', p_loser_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_season_match_member_updates(
  uuid, uuid, integer, integer, integer, integer
) TO service_role;

-- ------------------------------------------------------------
-- Undo one season match on members (subtract elo deltas; wins/losses -= 1).
-- Does not change streak — recompute in app after delete/update.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.apply_season_match_undo_stats(
  p_player1_id uuid,
  p_player2_id uuid,
  p_winner_id uuid,
  p_delta1 integer,
  p_delta2 integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n int;
BEGIN
  IF p_player1_id = p_player2_id THEN
    RAISE EXCEPTION 'player1 and player2 must differ';
  END IF;
  IF p_winner_id <> p_player1_id AND p_winner_id <> p_player2_id THEN
    RAISE EXCEPTION 'winner must be player1 or player2';
  END IF;

  UPDATE public.members
  SET
    elo = elo - COALESCE(p_delta1, 0),
    wins = CASE WHEN p_winner_id = p_player1_id THEN GREATEST(0, wins - 1) ELSE wins END,
    losses = CASE WHEN p_winner_id = p_player1_id THEN losses ELSE GREATEST(0, losses - 1) END
  WHERE id = p_player1_id;

  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 0 THEN
    RAISE EXCEPTION 'player1 member not found: %', p_player1_id;
  END IF;

  UPDATE public.members
  SET
    elo = elo - COALESCE(p_delta2, 0),
    wins = CASE WHEN p_winner_id = p_player2_id THEN GREATEST(0, wins - 1) ELSE wins END,
    losses = CASE WHEN p_winner_id = p_player2_id THEN losses ELSE GREATEST(0, losses - 1) END
  WHERE id = p_player2_id;

  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 0 THEN
    RAISE EXCEPTION 'player2 member not found: %', p_player2_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_season_match_undo_stats(
  uuid, uuid, uuid, integer, integer
) TO service_role;
