-- 고객사 상세 패널 확장 컬럼 추가
-- CustomerDetailPanel.jsx 구현에 대응하는 스키마 확장
-- 실행: supabase db query --linked --file supabase/add_customer_detail_fields.sql

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS status            text,
  ADD COLUMN IF NOT EXISTS lead_source       text,
  ADD COLUMN IF NOT EXISTS phone             text,
  ADD COLUMN IF NOT EXISTS business_type     text,
  ADD COLUMN IF NOT EXISTS region            text,
  ADD COLUMN IF NOT EXISTS business_age      int,
  ADD COLUMN IF NOT EXISTS received_date     date,
  ADD COLUMN IF NOT EXISTS received_month    text,
  ADD COLUMN IF NOT EXISTS resident_id_front text,
  ADD COLUMN IF NOT EXISTS birth_date        date,
  ADD COLUMN IF NOT EXISTS business_reg_date date,
  ADD COLUMN IF NOT EXISTS contract_amount   numeric,
  ADD COLUMN IF NOT EXISTS commission_rate   numeric,
  ADD COLUMN IF NOT EXISTS consultation_memo text,
  ADD COLUMN IF NOT EXISTS monthly_revenue   numeric,
  ADD COLUMN IF NOT EXISTS prev_year_revenue numeric,
  ADD COLUMN IF NOT EXISTS prev2_year_revenue numeric,
  ADD COLUMN IF NOT EXISTS existing_loan     numeric,
  ADD COLUMN IF NOT EXISTS required_funds    numeric,
  ADD COLUMN IF NOT EXISTS credit_score      int,
  ADD COLUMN IF NOT EXISTS tax_delinquent    boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS overdue_history   boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS rehabilitation    boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_exporter       boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS smart_device      boolean,
  ADD COLUMN IF NOT EXISTS closure_history   boolean,
  ADD COLUMN IF NOT EXISTS employee_count    int,
  ADD COLUMN IF NOT EXISTS policy_fund_usage boolean,
  ADD COLUMN IF NOT EXISTS aippin_id         text,
  ADD COLUMN IF NOT EXISTS aippin_pw         text,
  ADD COLUMN IF NOT EXISTS aippin_2fa        text,
  ADD COLUMN IF NOT EXISTS sbiz_id           text,
  ADD COLUMN IF NOT EXISTS sbiz_pw           text;

-- 민감 컬럼(인증정보) 코멘트 — RLS/애플리케이션 레이어에서 admin 전용 처리
COMMENT ON COLUMN customers.resident_id_front IS '주민등록번호 앞 6자리 — 관리자 전용 열람';
COMMENT ON COLUMN customers.aippin_id         IS '아이핀 ID — 관리자 전용 열람';
COMMENT ON COLUMN customers.aippin_pw         IS '아이핀 PW — 관리자 전용 열람';
COMMENT ON COLUMN customers.aippin_2fa        IS '아이핀 2차인증 — 관리자 전용 열람';
COMMENT ON COLUMN customers.sbiz_id           IS '소진공 ID — 관리자 전용 열람';
COMMENT ON COLUMN customers.sbiz_pw           IS '소진공 PW — 관리자 전용 열람';
