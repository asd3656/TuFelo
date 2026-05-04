-- 공지 및 건의 다이얼로그 상단 공지 (제작자만 사이트에서 수정)
-- 초기 문구는 아래 INSERT 한 곳에서만 정의합니다. 앱 코드에는 동일 본문을 두지 마세요.
CREATE TABLE IF NOT EXISTS public.site_notice (
  id smallint PRIMARY KEY DEFAULT 1,
  title text NOT NULL,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT site_notice_singleton CHECK (id = 1)
);

COMMENT ON TABLE public.site_notice IS '전역 공지(플로팅 메뉴). items: [{ text, size?: sm|base|lg }], text 내 **강조**';

INSERT INTO public.site_notice (id, title, items)
VALUES (
  1,
  '공지사항(26.04.14)',
  '[
    {"text": "건의 사항에는 **사담 금지**입니다. 장난성 글 작성 시 **IP 밴**입니다.", "size": "sm"},
    {"text": "필요이상으로 사이트가 무거워지길 원치 않기에 모든 건의사항들을 반영할 수 없습니다. 데이터 수정 같은 경우 **최대한 빠르게 반영**하겠습니다.", "size": "sm"},
    {"text": "모든 건의사항들은 **해결 완료 또는 반영불가 시 삭제**됩니다.", "size": "sm"},
    {"text": "ELO 랭킹페이지에 4월 초 데이터가 누락되는 이슈가 있었습니다. 4/14 기준 고쳤으니 elo 랭킹페이지와 현재시즌 경기 수가 안맞는 분들은 건의 게시판에 써주세요.", "size": "sm"}
  ]'::jsonb
)
ON CONFLICT (id) DO NOTHING;

-- Supabase SQL Editor 경고 대응: RLS 켜면 anon 키로 직접 접근 차단.
-- 조회·저장은 서버 Actions의 service_role만 사용하므로 정책 없이도 앱 동작에 문제 없음(service_role은 RLS 우회).
ALTER TABLE public.site_notice ENABLE ROW LEVEL SECURITY;
