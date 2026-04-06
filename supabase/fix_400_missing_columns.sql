-- 재무정보/기본정보 탭 400 에러 수정
-- 누락된 컬럼 일괄 추가 (kcb_score, nice_score, business_reg_no)
-- 실행: supabase db query --linked --file supabase/fix_400_missing_columns.sql

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS kcb_score       int,
  ADD COLUMN IF NOT EXISTS nice_score      int,
  ADD COLUMN IF NOT EXISTS business_reg_no text;

COMMENT ON COLUMN customers.kcb_score       IS 'KCB 개인 신용점수';
COMMENT ON COLUMN customers.nice_score      IS 'NICE 개인 신용점수';
COMMENT ON COLUMN customers.business_reg_no IS '사업자등록번호 (000-00-00000 형식)';
