-- 사업자등록번호 컬럼 추가
-- 형식: 000-00-00000 (텍스트로 저장, 하이픈 포함)
-- 실행: supabase db query --linked --file supabase/add_business_reg_no.sql

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS business_reg_no text;

COMMENT ON COLUMN customers.business_reg_no IS '사업자등록번호 (000-00-00000 형식)';
