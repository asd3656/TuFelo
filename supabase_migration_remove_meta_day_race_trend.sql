-- 데이터센터 "일자별 종족 승률 추이" 차트 제거에 따른 RPC 정리
-- get_data_center_detail_v2 에서 metaDayRaceTrend 계산(day_race_rows/day_race_stats CTE, 결과 키)을 제거한다.
-- Supabase SQL 에디터에서 직접 실행할 것 (자동 적용 없음).

CREATE OR REPLACE FUNCTION public.get_data_center_detail_v2(
  p_season_keys text[] DEFAULT NULL,
  p_map_names text[] DEFAULT NULL,
  p_match_types text[] DEFAULT NULL,
  p_races text[] DEFAULT NULL,          -- T/P/Z
  p_tiers integer[] DEFAULT NULL,       -- 1~4
  p_player_filter_enabled boolean DEFAULT false,
  p_player1_query text DEFAULT NULL,
  p_player2_query text DEFAULT NULL,    -- 단일 상대
  p_min_games integer DEFAULT 10,
  p_recent_days integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_min_games integer := GREATEST(0, COALESCE(p_min_games, 0));
  v_recent_days integer := GREATEST(0, COALESCE(p_recent_days, 0));
  v_player1_ids uuid[];
  v_player2_ids uuid[];
  v_result jsonb;
BEGIN
  SELECT COALESCE(array_agg(m.id), ARRAY[]::uuid[])
    INTO v_player1_ids
  FROM public.members m
  WHERE COALESCE(p_player_filter_enabled, false) = true
    AND COALESCE(trim(p_player1_query), '') <> ''
    AND m.is_active = true
    AND lower(m.name) LIKE '%' || lower(trim(p_player1_query)) || '%';

  SELECT COALESCE(array_agg(m.id), ARRAY[]::uuid[])
    INTO v_player2_ids
  FROM public.members m
  WHERE COALESCE(p_player_filter_enabled, false) = true
    AND COALESCE(trim(p_player2_query), '') <> ''
    AND m.is_active = true
    AND lower(m.name) LIKE '%' || lower(trim(p_player2_query)) || '%';

  WITH base_matches AS (
    SELECT mt.*
    FROM public.matches mt
    WHERE (
      p_season_keys IS NULL
      OR cardinality(p_season_keys) = 0
      OR EXISTS (
        SELECT 1
        FROM unnest(p_season_keys) AS sk(k)
        WHERE
          (k = '__proleague_s1__' AND upper(COALESCE(mt.match_type, '')) = 'TFPL_S1')
          OR (k = '__proleague_s2__' AND upper(COALESCE(mt.match_type, '')) = 'TFPL_S2')
          OR (k NOT IN ('__proleague_s1__', '__proleague_s2__') AND mt.season_id::text = k)
      )
    )
      AND (p_map_names IS NULL OR cardinality(p_map_names) = 0 OR mt.map_name = ANY(p_map_names))
      AND (p_match_types IS NULL OR cardinality(p_match_types) = 0 OR COALESCE(mt.match_type, '') = ANY(p_match_types))
      AND (
        v_recent_days <= 0
        OR mt.played_date >= (CURRENT_DATE - ((v_recent_days - 1) * INTERVAL '1 day'))::date
      )
      AND (
        COALESCE(p_player_filter_enabled, false) = false
        OR COALESCE(trim(p_player1_query), '') = ''
        OR mt.player1_id = ANY(v_player1_ids)
        OR mt.player2_id = ANY(v_player1_ids)
      )
      AND (
        COALESCE(p_player_filter_enabled, false) = false
        OR COALESCE(trim(p_player2_query), '') = ''
        OR mt.player1_id = ANY(v_player2_ids)
        OR mt.player2_id = ANY(v_player2_ids)
      )
      AND (
        COALESCE(p_player_filter_enabled, false) = false
        OR COALESCE(trim(p_player1_query), '') = ''
        OR COALESCE(trim(p_player2_query), '') = ''
        OR (
          (mt.player1_id = ANY(v_player1_ids) AND mt.player2_id = ANY(v_player2_ids))
          OR (mt.player2_id = ANY(v_player1_ids) AND mt.player1_id = ANY(v_player2_ids))
        )
      )
  ),
  matched AS (
    SELECT
      bm.*,
      m1.race AS p1_race,
      m2.race AS p2_race,
      m1.tier AS p1_tier,
      m2.tier AS p2_tier
    FROM base_matches bm
    LEFT JOIN public.members m1 ON m1.id = bm.player1_id
    LEFT JOIN public.members m2 ON m2.id = bm.player2_id
  ),
  race_tier_filtered AS (
    SELECT m.*
    FROM matched m
    WHERE
      (
        p_races IS NULL OR cardinality(p_races) = 0
        OR (
          (COALESCE(p_player_filter_enabled, false) = false OR COALESCE(trim(p_player1_query), '') = '')
          AND (m.p1_race = ANY(p_races) OR m.p2_race = ANY(p_races))
        )
        OR (
          COALESCE(p_player_filter_enabled, false) = true
          AND COALESCE(trim(p_player1_query), '') <> ''
          AND (
            (m.player1_id = ANY(v_player1_ids) AND m.p2_race = ANY(p_races))
            OR (m.player2_id = ANY(v_player1_ids) AND m.p1_race = ANY(p_races))
          )
        )
      )
      AND
      (
        p_tiers IS NULL OR cardinality(p_tiers) = 0
        OR (
          (COALESCE(p_player_filter_enabled, false) = false OR COALESCE(trim(p_player1_query), '') = '')
          AND (m.p1_tier = ANY(p_tiers) OR m.p2_tier = ANY(p_tiers))
        )
        OR (
          COALESCE(p_player_filter_enabled, false) = true
          AND COALESCE(trim(p_player1_query), '') <> ''
          AND (
            (m.player1_id = ANY(v_player1_ids) AND m.p2_tier = ANY(p_tiers))
            OR (m.player2_id = ANY(v_player1_ids) AND m.p1_tier = ANY(p_tiers))
          )
        )
      )
  ),
  -- 최근20: 선수1 관점
  p1_matches AS (
    SELECT
      m.id,
      COALESCE(m.map_name, '미상') AS map_name,
      CASE
        WHEN m.player1_id = ANY(v_player1_ids) THEN m.player1_id
        WHEN m.player2_id = ANY(v_player1_ids) THEN m.player2_id
        ELSE NULL
      END AS anchor_id,
      m.winner_id,
      m.played_date,
      m.created_at
    FROM race_tier_filtered m
    WHERE COALESCE(trim(p_player1_query), '') <> ''
      AND (m.player1_id = ANY(v_player1_ids) OR m.player2_id = ANY(v_player1_ids))
  ),
  p1_recent20 AS (
    SELECT *
    FROM p1_matches
    ORDER BY played_date DESC, created_at DESC
    LIMIT 20
  ),
  p1_recent20_maps AS (
    SELECT
      map_name,
      COUNT(*)::int AS games,
      SUM(CASE WHEN winner_id = anchor_id THEN 1 ELSE 0 END)::int AS wins
    FROM p1_recent20
    GROUP BY map_name
  ),
  -- 메타 변동성 (최근7일) / 선수 Elo 추이(최근14일)용 공통 윈도우
  recent14 AS (
    SELECT m.*
    FROM race_tier_filtered m
    WHERE m.played_date >= (CURRENT_DATE - INTERVAL '13 day')::date
  ),
  recent7 AS (
    SELECT m.*
    FROM race_tier_filtered m
    WHERE m.played_date >= (CURRENT_DATE - INTERVAL '6 day')::date
  ),
  elo_points AS (
    SELECT
      r.player1_id AS member_id,
      r.played_date,
      r.id AS match_id,
      (r.player1_elo_before + r.player1_elo_delta)::numeric AS elo
    FROM recent7 r
    WHERE r.player1_elo_before IS NOT NULL AND r.player1_elo_delta IS NOT NULL
    UNION ALL
    SELECT
      r.player2_id AS member_id,
      r.played_date,
      r.id AS match_id,
      (r.player2_elo_before + r.player2_elo_delta)::numeric AS elo
    FROM recent7 r
    WHERE r.player2_elo_before IS NOT NULL AND r.player2_elo_delta IS NOT NULL
  ),
  elo_stats AS (
    SELECT
      e.member_id,
      COUNT(*)::int AS games,
      MIN(e.elo) AS trough_elo,
      MAX(e.elo) AS peak_elo,
      (ARRAY_AGG(e.elo ORDER BY e.played_date, e.match_id DESC))[COUNT(*)] AS current_elo
    FROM elo_points e
    GROUP BY e.member_id
    HAVING COUNT(*) >= 2
  ),
  -- 선수 Elo 추이 (최근14일 일 마지막 경기 Elo)
  p1_day_elo AS (
    SELECT
      r.played_date AS day_key,
      CASE
        WHEN r.player1_id = ANY(v_player1_ids) THEN (r.player1_elo_before + r.player1_elo_delta)::numeric
        WHEN r.player2_id = ANY(v_player1_ids) THEN (r.player2_elo_before + r.player2_elo_delta)::numeric
        ELSE NULL
      END AS p1_elo,
      r.id AS match_id
    FROM recent14 r
    WHERE COALESCE(trim(p_player1_query), '') <> ''
      AND (r.player1_id = ANY(v_player1_ids) OR r.player2_id = ANY(v_player1_ids))
  ),
  p2_day_elo AS (
    SELECT
      r.played_date AS day_key,
      CASE
        WHEN r.player1_id = ANY(v_player2_ids) THEN (r.player1_elo_before + r.player1_elo_delta)::numeric
        WHEN r.player2_id = ANY(v_player2_ids) THEN (r.player2_elo_before + r.player2_elo_delta)::numeric
        ELSE NULL
      END AS p2_elo,
      r.id AS match_id
    FROM recent14 r
    WHERE COALESCE(trim(p_player2_query), '') <> ''
      AND (r.player1_id = ANY(v_player2_ids) OR r.player2_id = ANY(v_player2_ids))
  ),
  p1_last AS (
    SELECT DISTINCT ON (day_key)
      day_key, p1_elo
    FROM p1_day_elo
    WHERE p1_elo IS NOT NULL
    ORDER BY day_key, match_id DESC
  ),
  p2_last AS (
    SELECT DISTINCT ON (day_key)
      day_key, p2_elo
    FROM p2_day_elo
    WHERE p2_elo IS NOT NULL
    ORDER BY day_key, match_id DESC
  )
  SELECT jsonb_build_object(
    'recent20Matches',
    COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', r.id,
          'mapName', r.map_name,
          'mapShort', left(r.map_name, 2),
          'isWin', (r.winner_id = r.anchor_id)
        )
        ORDER BY r.played_date DESC, r.created_at DESC
      )
      FROM p1_recent20 r
    ), '[]'::jsonb),
    'recent20Summary',
    COALESCE((
      SELECT jsonb_build_object(
        'games', COUNT(*)::int,
        'wins', SUM(CASE WHEN winner_id = anchor_id THEN 1 ELSE 0 END)::int,
        'losses', (COUNT(*) - SUM(CASE WHEN winner_id = anchor_id THEN 1 ELSE 0 END))::int,
        'winRate',
        CASE
          WHEN COUNT(*) > 0 THEN round((SUM(CASE WHEN winner_id = anchor_id THEN 1 ELSE 0 END)::numeric / COUNT(*)::numeric) * 100, 1)
          ELSE 0
        END
      )
      FROM p1_recent20
    ), jsonb_build_object('games', 0, 'wins', 0, 'losses', 0, 'winRate', 0)),
    'recent20MapWins',
    COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'mapName', m.map_name,
          'games', m.games,
          'wins', m.wins,
          'losses', (m.games - m.wins),
          'winRate', CASE WHEN m.games > 0 THEN round((m.wins::numeric / m.games::numeric) * 100, 1) ELSE 0 END
        )
        ORDER BY m.games DESC, m.map_name
      )
      FROM p1_recent20_maps m
    ), '[]'::jsonb),
    'metaEloVolatilityRows',
    COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'name', COALESCE(m.name, '알 수 없음'),
          'games', s.games,
          'currentElo', s.current_elo,
          'peakElo', s.peak_elo,
          'troughElo', s.trough_elo,
          'range', (s.peak_elo - s.trough_elo),
          'drawdown', GREATEST(0, s.peak_elo - s.current_elo),
          'rangeRemainder', GREATEST(0, (s.peak_elo - s.trough_elo) - GREATEST(0, s.peak_elo - s.current_elo))
        )
        ORDER BY (s.peak_elo - s.trough_elo) DESC, GREATEST(0, s.peak_elo - s.current_elo) DESC, s.games DESC
      )
      FROM (
        SELECT *
        FROM elo_stats
        ORDER BY (peak_elo - trough_elo) DESC, GREATEST(0, peak_elo - current_elo) DESC, games DESC
        LIMIT 10
      ) s
      LEFT JOIN public.members m ON m.id = s.member_id
    ), '[]'::jsonb),
    'versusEloTrend',
    COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'weekLabel', EXTRACT(MONTH FROM d.day_key)::int::text || '.' || EXTRACT(DAY FROM d.day_key)::int::text,
          'p1Elo', d.p1_elo,
          'p2Elo', d.p2_elo
        )
        ORDER BY d.day_key
      )
      FROM (
        SELECT
          coalesce(p1.day_key, p2.day_key) AS day_key,
          p1.p1_elo,
          p2.p2_elo
        FROM p1_last p1
        FULL OUTER JOIN p2_last p2 ON p1.day_key = p2.day_key
        ORDER BY coalesce(p1.day_key, p2.day_key) DESC
        LIMIT 14
      ) d
    ), '[]'::jsonb)
  )
  INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_data_center_detail_v2(
  text[], text[], text[], text[], integer[], boolean, text, text, integer, integer
) TO anon, authenticated, service_role;
