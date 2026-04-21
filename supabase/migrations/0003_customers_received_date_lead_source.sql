-- 0003_customers_received_date_lead_source.sql
-- customers 테이블에 접수일(received_date), 유입경로(lead_source) 컬럼 추가
-- 참고: 이전 0002에서 received_at을 추가했으나 상세 패널 키(received_date)와 불일치하여 신규 컬럼으로 교체

ALTER TABLE customers ADD COLUMN IF NOT EXISTS received_date date;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS lead_source text;
