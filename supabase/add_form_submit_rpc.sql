-- ============================================================
-- add_form_submit_rpc.sql
-- 목적: 구글 폼 → Apps Script → Supabase 연동용 RPC
--
-- 문제: anon 키로 customers에 직접 INSERT 시 RLS 차단 (42501)
--       auth.uid()가 null → get_my_workspace_id() null → 정책 거부
--
-- 해결: SECURITY DEFINER 함수로 RLS를 우회해 지정 workspace에만 INSERT
--       anon 역할에 EXECUTE 권한 부여 → Apps Script에서 서비스 키 불필요
--
-- 실행: Supabase Dashboard > SQL Editor에 붙여넣기 후 실행
-- ============================================================

CREATE OR REPLACE FUNCTION public.submit_customer_form(
  p_workspace_id    uuid,
  p_company         text,
  p_phone           text      DEFAULT NULL,
  p_lead_source     text      DEFAULT NULL,
  p_business_type   text      DEFAULT NULL,
  p_industry        text      DEFAULT NULL,
  p_region          text      DEFAULT NULL,
  p_business_age    int       DEFAULT NULL,
  p_monthly_revenue numeric   DEFAULT NULL,
  p_tax_delinquent  boolean   DEFAULT false,
  p_required_funds  numeric   DEFAULT NULL,
  p_consultation_memo text    DEFAULT NULL,
  p_tags            text[]    DEFAULT NULL,
  p_received_date   date      DEFAULT NULL,
  p_business_reg_no text      DEFAULT NULL
)
RETURNS uuid   -- 생성된 customer id 반환
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer_id uuid;
  v_allowed_ws  uuid := 'a1650b9e-31da-43e6-9179-17390d06f58c';
BEGIN
  -- workspace_id 화이트리스트 검증
  -- 등록된 워크스페이스로만 INSERT 가능 → 무단 데이터 주입 방지
  IF p_workspace_id IS DISTINCT FROM v_allowed_ws THEN
    RAISE EXCEPTION '허용되지 않은 워크스페이스입니다.';
  END IF;

  -- company 필수값 검증
  IF p_company IS NULL OR trim(p_company) = '' THEN
    RAISE EXCEPTION '업체명은 필수 입력값입니다.';
  END IF;

  INSERT INTO public.customers (
    workspace_id,
    company,
    phone,
    lead_source,
    business_type,
    industry,
    region,
    business_age,
    monthly_revenue,
    tax_delinquent,
    required_funds,
    consultation_memo,
    tags,
    received_date,
    status,
    score,
    pool,
    business_reg_no
  ) VALUES (
    p_workspace_id,
    trim(p_company),
    p_phone,
    p_lead_source,
    p_business_type,
    p_industry,
    p_region,
    p_business_age,
    p_monthly_revenue,
    COALESCE(p_tax_delinquent, false),
    p_required_funds,
    p_consultation_memo,
    p_tags,
    COALESCE(p_received_date, CURRENT_DATE),
    '신규',
    0,
    false,
    p_business_reg_no
  )
  RETURNING id INTO v_customer_id;

  RETURN v_customer_id;
END;
$$;

-- anon + authenticated 모두 호출 가능
GRANT EXECUTE ON FUNCTION public.submit_customer_form(
  uuid, text, text, text, text, text, text, int, numeric, boolean, numeric, text, text[], date, text
) TO anon, authenticated;
