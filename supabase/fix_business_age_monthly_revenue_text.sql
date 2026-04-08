-- business_age, monthly_revenue 컬럼 타입을 text로 변경
-- 기존 int/numeric 타입은 "3년 2개월", "3,500만원~5,000만원" 등 자유형식 입력 불가
-- 실행: supabase db query --linked --file supabase/fix_business_age_monthly_revenue_text.sql

ALTER TABLE customers
  ALTER COLUMN business_age      TYPE text USING business_age::text,
  ALTER COLUMN monthly_revenue   TYPE text USING monthly_revenue::text;
