-- customers 테이블에 quick_memo 컬럼 추가
-- 목적: 고객사 목록 테이블에서 직원이 빠르게 입력하는 한 줄 메모
--       consultation_memo(상담 내용 상세)와 완전히 별개 필드
-- RLS: 기존 customers 테이블 ALL 정책 (workspace_id = get_my_workspace_id()) 으로 커버됨
-- 별도 GRANT/RLS 불필요

ALTER TABLE customers ADD COLUMN IF NOT EXISTS quick_memo text;

COMMENT ON COLUMN customers.quick_memo IS '목록 인라인 메모 — 최대 80자, consultation_memo와 별개';
