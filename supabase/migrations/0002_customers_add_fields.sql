-- 0002_customers_add_fields.sql
-- customers 테이블에 신규 필드 3개 추가
-- (industry는 0001_setup.sql에 이미 존재)

ALTER TABLE customers ADD COLUMN IF NOT EXISTS received_at date;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS business_type text;
