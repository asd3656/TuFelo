-- ============================================================
-- 데이터센터 페이지 초기 번들 — 단일 RPC로 members + matches + seasons
-- Supabase SQL Editor에서 실행 후, 클라이언트는 fetchDataCenterInitialData 가 호출함.
--
-- LANGUAGE sql 로 작성: PL/pgSQL DECLARE 변수명을 Supabase 에디터가
-- "새 테이블 생성" 으로 오인해 RLS 경고 모달을 띄우는 문제를 피함.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_data_center_page_data(p_match_limit integer DEFAULT 200000)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'members', (
      SELECT COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'id', m.id,
            'name', m.name,
            'race', m.race,
            'tier', m.tier
          )
          ORDER BY m.name ASC
        ),
        '[]'::jsonb
      )
      FROM public.members m
      WHERE m.is_active = true
    ),
    'matches', (
      SELECT COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'id', mt.id,
            'player1Id', mt.player1_id,
            'player2Id', mt.player2_id,
            'winnerId', mt.winner_id,
            'mapName', COALESCE(mt.map_name, ''),
            'matchType', COALESCE(mt.match_type, '미분류'),
            'playedDate', mt.played_date,
            'seasonId', mt.season_id,
            'player1EloBefore', mt.player1_elo_before,
            'player2EloBefore', mt.player2_elo_before,
            'player1EloDelta', mt.player1_elo_delta,
            'player2EloDelta', mt.player2_elo_delta
          )
          ORDER BY mt.played_date DESC NULLS LAST, mt.created_at DESC
        ),
        '[]'::jsonb
      )
      FROM (
        SELECT
          id,
          player1_id,
          player2_id,
          winner_id,
          map_name,
          match_type,
          played_date,
          season_id,
          player1_elo_before,
          player2_elo_before,
          player1_elo_delta,
          player2_elo_delta,
          created_at
        FROM public.matches
        ORDER BY played_date DESC NULLS LAST, created_at DESC
        LIMIT GREATEST(1, LEAST(COALESCE(p_match_limit, 200000), 1000000))
      ) mt
    ),
    'seasons', (
      SELECT COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'id', s.id,
            'name', s.name,
            'startDate', s.start_date,
            'endDate', s.end_date,
            'createdAt', s.created_at
          )
          ORDER BY s.start_date DESC
        ),
        '[]'::jsonb
      )
      FROM public.seasons s
    )
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_data_center_page_data(integer) TO anon, authenticated, service_role;
