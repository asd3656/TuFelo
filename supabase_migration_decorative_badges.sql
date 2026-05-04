-- 전역 장식 뱃지(리그 우승 등) — 제작자가 문구·부여 선수 관리, 데이터센터 프로필에 표시
CREATE TABLE IF NOT EXISTS public.decorative_badges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  accent text NOT NULL DEFAULT 'amber',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.member_decorative_badges (
  badge_id uuid NOT NULL REFERENCES public.decorative_badges (id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.members (id) ON DELETE CASCADE,
  PRIMARY KEY (badge_id, member_id)
);

CREATE INDEX IF NOT EXISTS idx_member_decorative_badges_member_id ON public.member_decorative_badges (member_id);

COMMENT ON TABLE public.decorative_badges IS '데이터센터 전역 장식 뱃지 (표시 문구 = label, 예: TFPL S2 우승 발할라)';
COMMENT ON TABLE public.member_decorative_badges IS '뱃지를 달 멤버 (팀 우승 시 여러 명)';

ALTER TABLE public.decorative_badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_decorative_badges ENABLE ROW LEVEL SECURITY;

-- 데이터센터 공개 표시용 조회 (쓰기는 서버 service_role 전용)
CREATE POLICY decorative_badges_select_anon ON public.decorative_badges
  FOR SELECT TO anon USING (true);
CREATE POLICY decorative_badges_select_auth ON public.decorative_badges
  FOR SELECT TO authenticated USING (true);

CREATE POLICY member_decorative_badges_select_anon ON public.member_decorative_badges
  FOR SELECT TO anon USING (true);
CREATE POLICY member_decorative_badges_select_auth ON public.member_decorative_badges
  FOR SELECT TO authenticated USING (true);
