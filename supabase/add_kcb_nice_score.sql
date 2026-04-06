-- 신용점수 KCB / NICE 분리 컬럼 추가
-- 기존 credit_score(int) 대신 KCB, NICE 각각 별도 저장
-- 실행: supabase db query --linked --file supabase/add_kcb_nice_score.sql

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS kcb_score  int,
  ADD COLUMN IF NOT EXISTS nice_score int;

COMMENT ON COLUMN customers.kcb_score  IS 'KCB 개인 신용점수';
COMMENT ON COLUMN customers.nice_score IS 'NICE 개인 신용점수';
