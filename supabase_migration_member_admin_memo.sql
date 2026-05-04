-- 클랜원 관리자 전용 메모 (일반 조회/랭킹 API에서는 select 하지 않음)
ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS admin_memo text;

COMMENT ON COLUMN public.members.admin_memo IS '관리자 전용 내부 메모. 비관리자 조회에서 제외할 것.';
