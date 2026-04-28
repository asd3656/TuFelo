-- Query plan checks (read-only)
-- Run in Supabase SQL Editor when you want to validate index usage.
-- If tables are large, use EXPLAIN first (without ANALYZE), then add ANALYZE selectively.

-- 1) Data-center / dashboard main ordering path
EXPLAIN (FORMAT TEXT)
SELECT
  id, player1_id, player2_id, winner_id, map_name, match_type, played_date, season_id,
  player1_elo_before, player2_elo_before, player1_elo_delta, player2_elo_delta, created_at
FROM public.matches
ORDER BY played_date DESC NULLS LAST, created_at DESC
LIMIT 5000;

-- 2) API season filter path
EXPLAIN (FORMAT TEXT)
SELECT id
FROM public.matches
WHERE season_id IS NOT NULL
ORDER BY played_date DESC, created_at DESC
LIMIT 200;

-- 3) API match_type filter path
EXPLAIN (FORMAT TEXT)
SELECT id
FROM public.matches
WHERE match_type = 'TFPL_S1'
ORDER BY played_date DESC, created_at DESC
LIMIT 200;

-- 4) Player-centric lookup path (player1/player2)
EXPLAIN (FORMAT TEXT)
SELECT id
FROM public.matches
WHERE player1_id = (
  SELECT id FROM public.members WHERE is_active = true ORDER BY name ASC LIMIT 1
)
   OR player2_id = (
  SELECT id FROM public.members WHERE is_active = true ORDER BY name ASC LIMIT 1
)
ORDER BY played_date DESC, created_at DESC
LIMIT 200;

-- 5) Active member list path
EXPLAIN (FORMAT TEXT)
SELECT id, name, race, tier, elo, wins, losses, streak, is_active
FROM public.members
WHERE is_active = true
ORDER BY name ASC;
