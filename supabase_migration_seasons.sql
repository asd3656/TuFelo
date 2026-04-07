-- ============================================================
-- TuFelo 시즌 시스템 마이그레이션
-- Supabase SQL Editor에서 순서대로 실행하세요.
-- ============================================================

-- 1. seasons 테이블 생성
CREATE TABLE IF NOT EXISTS seasons (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  start_date date NOT NULL,
  end_date date,          -- NULL = 현재 진행 중인 시즌
  created_at timestamptz DEFAULT now()
);

-- 2. matches 테이블에 season_id 컬럼 추가
ALTER TABLE matches ADD COLUMN IF NOT EXISTS season_id uuid REFERENCES seasons(id) ON DELETE SET NULL;

-- elo_before 컬럼을 nullable로 변경 (비시즌 경기는 null)
ALTER TABLE matches ALTER COLUMN player1_elo_before DROP NOT NULL;
ALTER TABLE matches ALTER COLUMN player2_elo_before DROP NOT NULL;

-- 3. season_rankings 스냅샷 테이블 생성 (시즌 종료 시 최종 순위 저장)
CREATE TABLE IF NOT EXISTS season_rankings (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  season_id uuid NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  final_elo integer NOT NULL,
  final_wins integer NOT NULL DEFAULT 0,
  final_losses integer NOT NULL DEFAULT 0,
  rank integer NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(season_id, member_id)
);

-- 4. 성능 인덱스
CREATE INDEX IF NOT EXISTS idx_matches_season_id ON matches(season_id);
CREATE INDEX IF NOT EXISTS idx_matches_played_date ON matches(played_date);
CREATE INDEX IF NOT EXISTS idx_season_rankings_season_id ON season_rankings(season_id);

-- ============================================================
-- 완료! 기존 데이터는 모두 season_id = NULL (비시즌)으로 남습니다.
-- 앱에서 "새 시즌 시작" 버튼을 눌러 시즌3를 생성하세요.
-- ============================================================
