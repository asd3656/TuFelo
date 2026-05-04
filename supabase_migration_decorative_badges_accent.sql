-- 기존 decorative_badges 테이블에 색상 프리셋 컬럼 추가 (앱: lib/decorative-badge-accent.ts 와 동일 키)
ALTER TABLE public.decorative_badges
  ADD COLUMN IF NOT EXISTS accent text NOT NULL DEFAULT 'amber';

COMMENT ON COLUMN public.decorative_badges.accent IS '뱃지 색 프리셋: amber, sky, emerald, violet, rose, orange, blue, fuchsia, cyan, slate';
