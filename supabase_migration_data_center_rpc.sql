-- ============================================================
-- TuFelo 데이터센터 RPC (집계 전용)
-- Supabase SQL Editor에서 전체 실행하세요.
-- ============================================================

-- 성능 인덱스 (없으면 생성)
CREATE INDEX IF NOT EXISTS idx_matches_season_id_played_date
  ON public.matches (season_id, played_date DESC);
CREATE INDEX IF NOT EXISTS idx_matches_map_name
  ON public.matches (map_name);
CREATE INDEX IF NOT EXISTS idx_matches_match_type
  ON public.matches (match_type);
CREATE INDEX IF NOT EXISTS idx_matches_player1
  ON public.matches (player1_id);
CREATE INDEX IF NOT EXISTS idx_matches_player2
  ON public.matches (player2_id);

-- ------------------------------------------------------------
-- 데이터센터 집계 데이터 (종족 승률 + 맵별 종족 승률 + 상대전 맵 승률)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_data_center_summary(
  p_season_id uuid DEFAULT NULL,
  p_map_name text DEFAULT NULL,
  p_match_type text DEFAULT NULL,
  p_race text DEFAULT NULL,      -- 'T'|'P'|'Z' 또는 NULL
  p_player1_query text DEFAULT NULL,
  p_player2_query text DEFAULT NULL,
  p_min_games integer DEFAULT 10
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_min_games integer := GREATEST(10, COALESCE(p_min_games, 10));
  v_player1_ids uuid[];
  v_player2_ids uuid[];
  v_result jsonb;
BEGIN
  SELECT COALESCE(array_agg(m.id), ARRAY[]::uuid[])
    INTO v_player1_ids
  FROM public.members m
  WHERE p_player1_query IS NOT NULL
    AND p_player1_query <> ''
    AND m.is_active = true
    AND lower(m.name) LIKE '%' || lower(p_player1_query) || '%';

  SELECT COALESCE(array_agg(m.id), ARRAY[]::uuid[])
    INTO v_player2_ids
  FROM public.members m
  WHERE p_player2_query IS NOT NULL
    AND p_player2_query <> ''
    AND m.is_active = true
    AND lower(m.name) LIKE '%' || lower(p_player2_query) || '%';

  WITH base_matches AS (
    SELECT mt.*
    FROM public.matches mt
    WHERE (p_season_id IS NULL OR mt.season_id = p_season_id)
      AND (p_map_name IS NULL OR p_map_name = '' OR mt.map_name = p_map_name)
      AND (p_match_type IS NULL OR p_match_type = '' OR mt.match_type = p_match_type)
      AND (
        p_player1_query IS NULL OR p_player1_query = ''
        OR mt.player1_id = ANY(v_player1_ids)
        OR mt.player2_id = ANY(v_player1_ids)
      )
      AND (
        p_player2_query IS NULL OR p_player2_query = ''
        OR mt.player1_id = ANY(v_player2_ids)
        OR mt.player2_id = ANY(v_player2_ids)
      )
      AND (
        p_player1_query IS NULL OR p_player1_query = ''
        OR p_player2_query IS NULL OR p_player2_query = ''
        OR (
          (mt.player1_id = ANY(v_player1_ids) AND mt.player2_id = ANY(v_player2_ids))
          OR (mt.player2_id = ANY(v_player1_ids) AND mt.player1_id = ANY(v_player2_ids))
        )
      )
  ),
  race_filtered_matches AS (
    SELECT bm.*
    FROM base_matches bm
    LEFT JOIN public.members m1 ON m1.id = bm.player1_id
    LEFT JOIN public.members m2 ON m2.id = bm.player2_id
    WHERE (
      p_race IS NULL OR p_race = '' OR p_race = '__all__'
      OR m1.race = p_race
      OR m2.race = p_race
    )
  ),
  perspective_rows AS (
    SELECT
      bm.map_name,
      m1.race AS race,
      CASE WHEN bm.winner_id = bm.player1_id THEN 1 ELSE 0 END AS is_win
    FROM race_filtered_matches bm
    JOIN public.members m1 ON m1.id = bm.player1_id
    WHERE p_player1_query IS NULL OR p_player1_query = '' OR bm.player1_id = ANY(v_player1_ids)
    UNION ALL
    SELECT
      bm.map_name,
      m2.race AS race,
      CASE WHEN bm.winner_id = bm.player2_id THEN 1 ELSE 0 END AS is_win
    FROM race_filtered_matches bm
    JOIN public.members m2 ON m2.id = bm.player2_id
    WHERE p_player1_query IS NULL OR p_player1_query = '' OR bm.player2_id = ANY(v_player1_ids)
  ),
  race_stats AS (
    SELECT
      race,
      COUNT(*)::int AS games,
      SUM(is_win)::int AS wins
    FROM perspective_rows
    GROUP BY race
  ),
  map_race_stats AS (
    SELECT
      pr.map_name,
      pr.race,
      COUNT(*)::int AS games,
      SUM(pr.is_win)::int AS wins
    FROM perspective_rows pr
    GROUP BY pr.map_name, pr.race
  ),
  maps_eligible_for_chart AS (
    SELECT DISTINCT map_name
    FROM map_race_stats
    WHERE games >= v_min_games
  ),
  pvp_map_stats AS (
    SELECT
      bm.map_name,
      COUNT(*)::int AS games,
      SUM(
        CASE
          WHEN bm.winner_id = bm.player1_id AND bm.player1_id = ANY(v_player1_ids) THEN 1
          WHEN bm.winner_id = bm.player2_id AND bm.player2_id = ANY(v_player1_ids) THEN 1
          ELSE 0
        END
      )::int AS wins
    FROM race_filtered_matches bm
    WHERE p_player1_query IS NOT NULL AND p_player1_query <> ''
      AND p_player2_query IS NOT NULL AND p_player2_query <> ''
    GROUP BY bm.map_name
    HAVING COUNT(*) >= v_min_games
  )
  SELECT jsonb_build_object(
    'raceWinRates',
    COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'race', r.race,
          'games', r.games,
          'wins', r.wins,
          'winRate', CASE WHEN r.games > 0 THEN round((r.wins::numeric / r.games::numeric) * 100, 1) ELSE 0 END
        )
        ORDER BY CASE r.race WHEN 'T' THEN 1 WHEN 'P' THEN 2 WHEN 'Z' THEN 3 ELSE 4 END
      )
      FROM race_stats r
      WHERE r.games >= v_min_games
    ), '[]'::jsonb),
    'mapRaceWinRates',
    COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'map', el.map_name,
          'total', COALESCE(t.games, 0) + COALESCE(p.games, 0) + COALESCE(z.games, 0),
          'T', CASE WHEN COALESCE(t.games, 0) >= v_min_games THEN round((t.wins::numeric / NULLIF(t.games, 0)) * 100, 1) ELSE NULL END,
          'P', CASE WHEN COALESCE(p.games, 0) >= v_min_games THEN round((p.wins::numeric / NULLIF(p.games, 0)) * 100, 1) ELSE NULL END,
          'Z', CASE WHEN COALESCE(z.games, 0) >= v_min_games THEN round((z.wins::numeric / NULLIF(z.games, 0)) * 100, 1) ELSE NULL END,
          'tGames', COALESCE(t.games, 0),
          'pGames', COALESCE(p.games, 0),
          'zGames', COALESCE(z.games, 0)
        )
        ORDER BY (COALESCE(t.games, 0) + COALESCE(p.games, 0) + COALESCE(z.games, 0)) DESC, el.map_name
      )
      FROM maps_eligible_for_chart el
      LEFT JOIN map_race_stats t ON t.map_name = el.map_name AND t.race = 'T'
      LEFT JOIN map_race_stats p ON p.map_name = el.map_name AND p.race = 'P'
      LEFT JOIN map_race_stats z ON z.map_name = el.map_name AND z.race = 'Z'
    ), '[]'::jsonb),
    'playerVsPlayerMapWinRates',
    COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'map', pvp.map_name,
          'games', pvp.games,
          'wins', pvp.wins,
          'winRate', CASE WHEN pvp.games > 0 THEN round((pvp.wins::numeric / pvp.games::numeric) * 100, 1) ELSE 0 END
        )
        ORDER BY pvp.games DESC, pvp.map_name
      )
      FROM pvp_map_stats pvp
    ), '[]'::jsonb),
    'totalMatchCount', COALESCE((SELECT COUNT(*) FROM race_filtered_matches), 0)
  )
  INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_data_center_summary(
  uuid, text, text, text, text, text, integer
) TO anon, authenticated, service_role;

-- ------------------------------------------------------------
-- 시즌별 종족 승률 추이
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_data_center_season_trend(
  p_map_name text DEFAULT NULL,
  p_match_type text DEFAULT NULL,
  p_race text DEFAULT NULL,
  p_player1_query text DEFAULT NULL,
  p_player2_query text DEFAULT NULL,
  p_min_games integer DEFAULT 10
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_min_games integer := GREATEST(10, COALESCE(p_min_games, 10));
  v_player1_ids uuid[];
  v_player2_ids uuid[];
  v_result jsonb;
BEGIN
  SELECT COALESCE(array_agg(m.id), ARRAY[]::uuid[])
    INTO v_player1_ids
  FROM public.members m
  WHERE p_player1_query IS NOT NULL
    AND p_player1_query <> ''
    AND m.is_active = true
    AND lower(m.name) LIKE '%' || lower(p_player1_query) || '%';

  SELECT COALESCE(array_agg(m.id), ARRAY[]::uuid[])
    INTO v_player2_ids
  FROM public.members m
  WHERE p_player2_query IS NOT NULL
    AND p_player2_query <> ''
    AND m.is_active = true
    AND lower(m.name) LIKE '%' || lower(p_player2_query) || '%';

  WITH base_matches AS (
    SELECT mt.*
    FROM public.matches mt
    WHERE mt.season_id IS NOT NULL
      AND (p_map_name IS NULL OR p_map_name = '' OR mt.map_name = p_map_name)
      AND (p_match_type IS NULL OR p_match_type = '' OR mt.match_type = p_match_type)
      AND (
        p_player1_query IS NULL OR p_player1_query = ''
        OR mt.player1_id = ANY(v_player1_ids)
        OR mt.player2_id = ANY(v_player1_ids)
      )
      AND (
        p_player2_query IS NULL OR p_player2_query = ''
        OR mt.player1_id = ANY(v_player2_ids)
        OR mt.player2_id = ANY(v_player2_ids)
      )
      AND (
        p_player1_query IS NULL OR p_player1_query = ''
        OR p_player2_query IS NULL OR p_player2_query = ''
        OR (
          (mt.player1_id = ANY(v_player1_ids) AND mt.player2_id = ANY(v_player2_ids))
          OR (mt.player2_id = ANY(v_player1_ids) AND mt.player1_id = ANY(v_player2_ids))
        )
      )
  ),
  race_filtered_matches AS (
    SELECT bm.*
    FROM base_matches bm
    LEFT JOIN public.members m1 ON m1.id = bm.player1_id
    LEFT JOIN public.members m2 ON m2.id = bm.player2_id
    WHERE (
      p_race IS NULL OR p_race = '' OR p_race = '__all__'
      OR m1.race = p_race
      OR m2.race = p_race
    )
  ),
  perspective_rows AS (
    SELECT
      bm.season_id,
      m1.race AS race,
      CASE WHEN bm.winner_id = bm.player1_id THEN 1 ELSE 0 END AS is_win
    FROM race_filtered_matches bm
    JOIN public.members m1 ON m1.id = bm.player1_id
    WHERE p_player1_query IS NULL OR p_player1_query = '' OR bm.player1_id = ANY(v_player1_ids)
    UNION ALL
    SELECT
      bm.season_id,
      m2.race AS race,
      CASE WHEN bm.winner_id = bm.player2_id THEN 1 ELSE 0 END AS is_win
    FROM race_filtered_matches bm
    JOIN public.members m2 ON m2.id = bm.player2_id
    WHERE p_player1_query IS NULL OR p_player1_query = '' OR bm.player2_id = ANY(v_player1_ids)
  ),
  season_race_stats AS (
    SELECT
      pr.season_id,
      pr.race,
      COUNT(*)::int AS games,
      SUM(pr.is_win)::int AS wins
    FROM perspective_rows pr
    GROUP BY pr.season_id, pr.race
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'seasonId', s.id,
        'season', s.name,
        'T', CASE WHEN t.games >= v_min_games THEN round((t.wins::numeric / NULLIF(t.games, 0)) * 100, 1) ELSE NULL END,
        'P', CASE WHEN p.games >= v_min_games THEN round((p.wins::numeric / NULLIF(p.games, 0)) * 100, 1) ELSE NULL END,
        'Z', CASE WHEN z.games >= v_min_games THEN round((z.wins::numeric / NULLIF(z.games, 0)) * 100, 1) ELSE NULL END
      )
      ORDER BY s.start_date
    ),
    '[]'::jsonb
  )
  INTO v_result
  FROM public.seasons s
  LEFT JOIN season_race_stats t ON t.season_id = s.id AND t.race = 'T'
  LEFT JOIN season_race_stats p ON p.season_id = s.id AND p.race = 'P'
  LEFT JOIN season_race_stats z ON z.season_id = s.id AND z.race = 'Z';

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_data_center_season_trend(
  text, text, text, text, text, integer
) TO anon, authenticated, service_role;

