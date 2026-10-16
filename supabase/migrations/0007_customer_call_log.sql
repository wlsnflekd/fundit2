-- ============================================================================
-- 0007_customer_call_log.sql
-- 1차 콜일지 탭 도입 + 미사용 민감정보 정리 + 사고이력 3단계(미확인/있음/없음)
-- ============================================================================
--
-- 섹션
--   A. 미사용 민감정보(주민번호·아이핀·소진공) 값 삭제 — 컬럼은 유지
--   B. 1차 콜일지 신규 컬럼
--   C. 세금체납 3단계 전환 — DEFAULT false 제거 + 기존 false(미확인 추정) → NULL (백업 후)
--   D. submit_customer_form: 체납 미입력을 false 가 아닌 NULL(미확인)로 저장
--   E. 신용·대출·사고 민감 항목 RPC: get_customer_credit / update_customer_credit
--
-- 실행: Supabase SQL Editor 에서 파일 전체를 한 번에 실행 (단일 트랜잭션)
--       약 3.7천 행 UPDATE → Realtime 이벤트가 몰리므로 사용량 적은 시간대 권장
-- 순서: 이 SQL 적용 → 프론트 배포 (프론트가 신규 컬럼/RPC 를 조회하므로)
-- 롤백: 파일 하단 ROLLBACK 섹션 참고 (섹션 A 삭제값은 복구 불가 — 의도된 영구 삭제)
-- ============================================================================

BEGIN;

-- ADD COLUMN 등은 ACCESS EXCLUSIVE 락 — 5초 내 못 잡으면 전체 롤백 후 재실행
SET LOCAL lock_timeout = '5s';


-- ── A. 미사용 민감정보 값 삭제 ───────────────────────────────────────────────
-- 사용하지 않는 정보(주민번호 856명, 아이핀 ID/PW 35명, 아이핀 2차 12명, 소진공 ID/PW 5명,
-- 합계 887명). 컬럼은 유지하고 값만 NULL 로 영구 삭제한다. 백업하지 않음(보관 자체가 위험).
UPDATE public.customers
SET resident_id_front = NULL,
    aippin_id         = NULL,
    aippin_pw         = NULL,
    aippin_2fa        = NULL,
    sbiz_id           = NULL,
    sbiz_pw           = NULL
WHERE resident_id_front IS NOT NULL
   OR aippin_id  IS NOT NULL OR aippin_pw IS NOT NULL OR aippin_2fa IS NOT NULL
   OR sbiz_id    IS NOT NULL OR sbiz_pw   IS NOT NULL;

COMMENT ON COLUMN public.customers.resident_id_front IS '미사용(0007에서 값 삭제). 신규 저장 금지';
COMMENT ON COLUMN public.customers.aippin_id         IS '미사용(0007에서 값 삭제). 신규 저장 금지';
COMMENT ON COLUMN public.customers.aippin_pw         IS '미사용(0007에서 값 삭제). 신규 저장 금지';
COMMENT ON COLUMN public.customers.aippin_2fa        IS '미사용(0007에서 값 삭제). 신규 저장 금지';
COMMENT ON COLUMN public.customers.sbiz_id           IS '미사용(0007에서 값 삭제). 신규 저장 금지';
COMMENT ON COLUMN public.customers.sbiz_pw           IS '미사용(0007에서 값 삭제). 신규 저장 금지';
-- get_customer_sensitive / update_customer_sensitive 는 현 프로덕션 프론트가 아직 호출하므로
-- 여기서 DROP 하지 않는다 → 하단 "후속 정리" 섹션을 새 프론트 배포 후 실행.


-- ── B. 1차 콜일지 신규 컬럼 ──────────────────────────────────────────────────
-- 연동 항목(ceo, company, industry, business_type, address, business_reg_date,
-- employee_count, prev_year_revenue, kcb_score, nice_score, rehabilitation,
-- tax_delinquent, closure_history, required_funds)은 기존 컬럼 그대로 사용.
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS business_category      text,     -- 업태
  ADD COLUMN IF NOT EXISTS loan_policy_fund       numeric,  -- 기존 대출: 정책자금 (만원) 🔒
  ADD COLUMN IF NOT EXISTS loan_business          numeric,  -- 기존 대출: 사업자 (만원) 🔒
  ADD COLUMN IF NOT EXISTS loan_personal          numeric,  -- 기존 대출: 개인 (만원) 🔒
  ADD COLUMN IF NOT EXISTS rehabilitation_memo    text,     -- 회생·파산 등 사고이력 내용 🔒
  ADD COLUMN IF NOT EXISTS tax_delinquent_amount  numeric,  -- 세금체납 금액 (만원) 🔒
  ADD COLUMN IF NOT EXISTS closure_memo           text,     -- 폐업이력 메모
  ADD COLUMN IF NOT EXISTS certifications         text[],   -- 보유 인증 (다중선택)
  ADD COLUMN IF NOT EXISTS certification_etc      text,     -- 보유 인증 '기타' 내용
  ADD COLUMN IF NOT EXISTS call_notes             text;     -- 1차콜 상담 특이사항

ALTER TABLE public.customers
  ADD CONSTRAINT customers_loan_policy_fund_nonneg      CHECK (loan_policy_fund      IS NULL OR loan_policy_fund      >= 0),
  ADD CONSTRAINT customers_loan_business_nonneg         CHECK (loan_business         IS NULL OR loan_business         >= 0),
  ADD CONSTRAINT customers_loan_personal_nonneg         CHECK (loan_personal         IS NULL OR loan_personal         >= 0),
  ADD CONSTRAINT customers_tax_delinquent_amount_nonneg CHECK (tax_delinquent_amount IS NULL OR tax_delinquent_amount >= 0),
  -- 허용값 외 저장 차단 (프론트 CERTIFICATION_OPTIONS 와 동일하게 유지)
  ADD CONSTRAINT customers_certifications_allowed       CHECK (
    certifications IS NULL
    OR certifications <@ ARRAY['특허','ISO','벤처','이노비즈','메인비즈','기업부설연구소','기타']::text[]
  );

COMMENT ON COLUMN public.customers.employee_count IS '상시근로자수 → 1차콜 화면에서 "4대보험 가입자 수"로 표시';


-- ── C. 세금체납 3단계 (NULL=미확인 / true=있음 / false=없음) ──────────────────
-- 기존 false 2,806명은 "확인 결과 없음"과 "미입력"이 섞여 구분 불가:
--   column DEFAULT false + submit_customer_form COALESCE(…, false)
--   + Apps Script parseBoolean(빈칸)=false 가 모두 false 로 저장해 왔음.
-- 제안안: 전부 NULL(미확인)으로 되돌려 1차콜에서 재확인. 원래 값은 백업 스키마에 보관.
-- (backup 스키마는 PostgREST 노출 대상이 아니며 anon/authenticated 권한 없음)
ALTER TABLE public.customers ALTER COLUMN tax_delinquent DROP DEFAULT;

CREATE SCHEMA IF NOT EXISTS backup;
REVOKE ALL ON SCHEMA backup FROM PUBLIC, anon, authenticated;

CREATE TABLE backup.customers_tax_delinquent_0007 AS
  SELECT id, tax_delinquent, now() AS backed_up_at
  FROM public.customers
  WHERE tax_delinquent = false;

REVOKE ALL ON backup.customers_tax_delinquent_0007 FROM PUBLIC, anon, authenticated;

UPDATE public.customers
SET tax_delinquent = NULL
WHERE tax_delinquent = false;


-- ── D. submit_customer_form: 체납 미입력 → NULL(미확인) ──────────────────────
-- 변경점 2곳만: p_tax_delinquent DEFAULT false → NULL, COALESCE(p_tax_delinquent, false) → p_tax_delinquent
-- 나머지(워크스페이스 화이트리스트, ON CONFLICT, 권한)는 현행 정의 그대로.
CREATE OR REPLACE FUNCTION public.submit_customer_form(
  p_workspace_id uuid, p_company text, p_phone text DEFAULT NULL::text,
  p_lead_source text DEFAULT NULL::text, p_business_type text DEFAULT NULL::text,
  p_industry text DEFAULT NULL::text, p_region text DEFAULT NULL::text,
  p_business_age text DEFAULT NULL::text, p_monthly_revenue text DEFAULT NULL::text,
  p_tax_delinquent boolean DEFAULT NULL::boolean, p_required_funds numeric DEFAULT NULL::numeric,
  p_consultation_memo text DEFAULT NULL::text, p_tags text[] DEFAULT NULL::text[],
  p_received_date date DEFAULT NULL::date, p_business_reg_no text DEFAULT NULL::text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_customer_id uuid;
  v_allowed_ws  uuid := 'a1650b9e-31da-43e6-9179-17390d06f58c';
BEGIN
  IF p_workspace_id IS DISTINCT FROM v_allowed_ws THEN
    RAISE EXCEPTION '허용되지 않은 워크스페이스입니다.';
  END IF;
  IF p_company IS NULL OR trim(p_company) = '' THEN
    RAISE EXCEPTION '업체명은 필수 입력값입니다.';
  END IF;

  INSERT INTO public.customers (
    workspace_id, company, phone, lead_source, business_type,
    industry, region, business_age, monthly_revenue, tax_delinquent,
    required_funds, consultation_memo, tags, received_date,
    status, score, pool, business_reg_no
  ) VALUES (
    p_workspace_id, trim(p_company), p_phone, p_lead_source, p_business_type,
    p_industry, p_region, p_business_age, p_monthly_revenue,
    p_tax_delinquent, p_required_funds, p_consultation_memo,
    p_tags, COALESCE(p_received_date, CURRENT_DATE),
    '신규', 0, false, p_business_reg_no
  )
  ON CONFLICT (workspace_id, phone) DO NOTHING
  RETURNING id INTO v_customer_id;

  RETURN v_customer_id;
END;
$function$;


-- ── E. 신용·대출·사고 민감 항목 RPC ──────────────────────────────────────────
-- 민감 범위: kcb_score, nice_score, loan_policy_fund, loan_business, loan_personal,
--            rehabilitation(+memo), tax_delinquent(+amount), existing_loan(읽기 전용)
-- 권한: admin/superadmin → 워크스페이스 전체, 그 외 → 본인 담당 고객만 (기존 sensitive RPC 와 동일)
-- SECURITY INVOKER: customers RLS(워크스페이스 격리)가 그대로 적용됨.
-- auth.uid()/get_my_workspace_id() 는 0006 과 동일하게 (select …) 래핑.
-- 주의: 컬럼 자체는 아직 customers 에 있어 직접 SELECT 가 가능 → customer_private 분리(후속)로 차단 예정.

CREATE OR REPLACE FUNCTION public.assert_customer_credit_access(p_customer_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_uid        uuid := (select auth.uid());
  v_role       text;
  v_consultant uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION '인증이 필요합니다.';
  END IF;

  SELECT p.role INTO v_role FROM public.profiles p WHERE p.id = v_uid;
  IF v_role IS NULL THEN
    RAISE EXCEPTION '프로필을 찾을 수 없습니다.';
  END IF;

  SELECT cu.consultant INTO v_consultant
  FROM public.customers cu
  WHERE cu.id = p_customer_id
    AND cu.workspace_id = (select public.get_my_workspace_id());
  IF NOT FOUND THEN
    RAISE EXCEPTION '고객사를 찾을 수 없거나 접근 권한이 없습니다.';
  END IF;

  IF v_role NOT IN ('admin', 'superadmin') AND v_consultant IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION '권한 없음: 담당 고객사의 신용·대출 정보만 열람/수정할 수 있습니다.';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_customer_credit(p_customer_id uuid)
RETURNS TABLE (
  id                    uuid,
  kcb_score             integer,
  nice_score            integer,
  existing_loan         numeric,
  loan_policy_fund      numeric,
  loan_business         numeric,
  loan_personal         numeric,
  rehabilitation        boolean,
  rehabilitation_memo   text,
  tax_delinquent        boolean,
  tax_delinquent_amount numeric
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_customer_credit_access(p_customer_id);

  RETURN QUERY
  SELECT c.id, c.kcb_score, c.nice_score, c.existing_loan,
         c.loan_policy_fund, c.loan_business, c.loan_personal,
         c.rehabilitation, c.rehabilitation_memo,
         c.tax_delinquent, c.tax_delinquent_amount
  FROM public.customers c
  WHERE c.id = p_customer_id
    AND c.workspace_id = (select public.get_my_workspace_id());
END;
$$;

-- p_patch: 수정할 키만 포함한 JSON. 키가 있으면 값으로 덮어씀(JSON null → NULL 로 지우기 가능),
--          키가 없으면 기존 값 유지. 허용 키 외(existing_loan 포함)는 거부.
CREATE OR REPLACE FUNCTION public.update_customer_credit(p_customer_id uuid, p_patch jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_allowed constant text[] := ARRAY[
    'kcb_score', 'nice_score',
    'loan_policy_fund', 'loan_business', 'loan_personal',
    'rehabilitation', 'rehabilitation_memo',
    'tax_delinquent', 'tax_delinquent_amount'
  ];
  v_bad text[];
BEGIN
  IF p_patch IS NULL OR jsonb_typeof(p_patch) <> 'object' THEN
    RAISE EXCEPTION 'p_patch 는 JSON 객체여야 합니다.';
  END IF;

  SELECT array_agg(k) INTO v_bad
  FROM jsonb_object_keys(p_patch) AS k
  WHERE k <> ALL (v_allowed);
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION '수정할 수 없는 항목입니다: %', array_to_string(v_bad, ', ');
  END IF;

  PERFORM public.assert_customer_credit_access(p_customer_id);

  -- 신용점수 범위 검증 (0~1000)
  IF (p_patch ? 'kcb_score'  AND (p_patch->>'kcb_score')::int  NOT BETWEEN 0 AND 1000)
  OR (p_patch ? 'nice_score' AND (p_patch->>'nice_score')::int NOT BETWEEN 0 AND 1000) THEN
    RAISE EXCEPTION '신용점수는 0~1000 사이여야 합니다.';
  END IF;

  UPDATE public.customers c SET
    kcb_score             = CASE WHEN p_patch ? 'kcb_score'             THEN (p_patch->>'kcb_score')::int              ELSE c.kcb_score             END,
    nice_score            = CASE WHEN p_patch ? 'nice_score'            THEN (p_patch->>'nice_score')::int             ELSE c.nice_score            END,
    loan_policy_fund      = CASE WHEN p_patch ? 'loan_policy_fund'      THEN (p_patch->>'loan_policy_fund')::numeric   ELSE c.loan_policy_fund      END,
    loan_business         = CASE WHEN p_patch ? 'loan_business'         THEN (p_patch->>'loan_business')::numeric      ELSE c.loan_business         END,
    loan_personal         = CASE WHEN p_patch ? 'loan_personal'         THEN (p_patch->>'loan_personal')::numeric      ELSE c.loan_personal         END,
    rehabilitation        = CASE WHEN p_patch ? 'rehabilitation'        THEN (p_patch->>'rehabilitation')::boolean     ELSE c.rehabilitation        END,
    rehabilitation_memo   = CASE WHEN p_patch ? 'rehabilitation_memo'   THEN  p_patch->>'rehabilitation_memo'          ELSE c.rehabilitation_memo   END,
    tax_delinquent        = CASE WHEN p_patch ? 'tax_delinquent'        THEN (p_patch->>'tax_delinquent')::boolean     ELSE c.tax_delinquent        END,
    tax_delinquent_amount = CASE WHEN p_patch ? 'tax_delinquent_amount' THEN (p_patch->>'tax_delinquent_amount')::numeric ELSE c.tax_delinquent_amount END
  WHERE c.id = p_customer_id
    AND c.workspace_id = (select public.get_my_workspace_id());

  IF NOT FOUND THEN
    RAISE EXCEPTION '고객사를 찾을 수 없거나 접근 권한이 없습니다.';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_customer_credit_access(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_customer_credit(uuid)           FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_customer_credit(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assert_customer_credit_access(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_customer_credit(uuid)           TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_customer_credit(uuid, jsonb) TO authenticated;

-- PostgREST 스키마 캐시 갱신 (신규 컬럼·RPC 즉시 인식)
NOTIFY pgrst, 'reload schema';

COMMIT;


-- ============================================================================
-- 검증 (실행 후 별도 실행) — 기대값을 주석으로 표기
-- ============================================================================
-- select count(*) filter (where coalesce(resident_id_front,aippin_id,aippin_pw,aippin_2fa,sbiz_id,sbiz_pw) is not null) as sensitive_left,  -- 0
--        count(*) filter (where tax_delinquent = false) as tax_false,     -- 0
--        count(*) filter (where tax_delinquent)         as tax_true,      -- 115 (변동 없음)
--        count(*) filter (where tax_delinquent is null) as tax_unknown    -- 2,806 (+ 기존 NULL)
-- from public.customers;
-- select count(*) from backup.customers_tax_delinquent_0007;            -- 2,806
-- select column_default from information_schema.columns
--  where table_schema='public' and table_name='customers' and column_name='tax_delinquent';  -- NULL


-- ============================================================================
-- 후속 정리 (새 프론트 프로덕션 배포 확인 후 실행) — 미사용 RPC 제거
-- ============================================================================
-- DROP FUNCTION IF EXISTS public.get_customer_sensitive(uuid);
-- DROP FUNCTION IF EXISTS public.update_customer_sensitive(uuid, text, text, text, text, text, text);


-- ============================================================================
-- ROLLBACK (문제 발생 시) — 섹션 A 삭제값은 복구 불가
-- ============================================================================
-- BEGIN;
-- DROP FUNCTION IF EXISTS public.update_customer_credit(uuid, jsonb);
-- DROP FUNCTION IF EXISTS public.get_customer_credit(uuid);
-- DROP FUNCTION IF EXISTS public.assert_customer_credit_access(uuid);
-- -- C 복원
-- UPDATE public.customers c SET tax_delinquent = b.tax_delinquent
--   FROM backup.customers_tax_delinquent_0007 b
--  WHERE c.id = b.id AND c.tax_delinquent IS NULL;
-- ALTER TABLE public.customers ALTER COLUMN tax_delinquent SET DEFAULT false;
-- -- D 복원: 0007 이전 라이브 정의 (p_tax_delinquent DEFAULT false + COALESCE(…, false)).
-- --   주의: supabase/fix_submit_customer_form_text_types.sql 은 ON CONFLICT 가 빠진 구버전이라 재실행 금지.
-- --   CREATE OR REPLACE 는 기존 GRANT(anon/authenticated 등)를 그대로 보존한다.
-- CREATE OR REPLACE FUNCTION public.submit_customer_form(
--   p_workspace_id uuid, p_company text, p_phone text DEFAULT NULL::text,
--   p_lead_source text DEFAULT NULL::text, p_business_type text DEFAULT NULL::text,
--   p_industry text DEFAULT NULL::text, p_region text DEFAULT NULL::text,
--   p_business_age text DEFAULT NULL::text, p_monthly_revenue text DEFAULT NULL::text,
--   p_tax_delinquent boolean DEFAULT false, p_required_funds numeric DEFAULT NULL::numeric,
--   p_consultation_memo text DEFAULT NULL::text, p_tags text[] DEFAULT NULL::text[],
--   p_received_date date DEFAULT NULL::date, p_business_reg_no text DEFAULT NULL::text
-- )
-- RETURNS uuid
-- LANGUAGE plpgsql
-- SECURITY DEFINER
-- SET search_path TO 'public'
-- AS $function$
-- DECLARE
--   v_customer_id uuid;
--   v_allowed_ws  uuid := 'a1650b9e-31da-43e6-9179-17390d06f58c';
-- BEGIN
--   IF p_workspace_id IS DISTINCT FROM v_allowed_ws THEN
--     RAISE EXCEPTION '허용되지 않은 워크스페이스입니다.';
--   END IF;
--   IF p_company IS NULL OR trim(p_company) = '' THEN
--     RAISE EXCEPTION '업체명은 필수 입력값입니다.';
--   END IF;
--
--   INSERT INTO public.customers (
--     workspace_id, company, phone, lead_source, business_type,
--     industry, region, business_age, monthly_revenue, tax_delinquent,
--     required_funds, consultation_memo, tags, received_date,
--     status, score, pool, business_reg_no
--   ) VALUES (
--     p_workspace_id, trim(p_company), p_phone, p_lead_source, p_business_type,
--     p_industry, p_region, p_business_age, p_monthly_revenue,
--     COALESCE(p_tax_delinquent, false), p_required_funds, p_consultation_memo,
--     p_tags, COALESCE(p_received_date, CURRENT_DATE),
--     '신규', 0, false, p_business_reg_no
--   )
--   ON CONFLICT (workspace_id, phone) DO NOTHING
--   RETURNING id INTO v_customer_id;
--
--   RETURN v_customer_id;
-- END;
-- $function$;
-- -- B 복원 (신규 컬럼에 입력된 데이터도 함께 삭제됨에 유의)
-- ALTER TABLE public.customers
--   DROP CONSTRAINT IF EXISTS customers_certifications_allowed,
--   DROP CONSTRAINT IF EXISTS customers_tax_delinquent_amount_nonneg,
--   DROP CONSTRAINT IF EXISTS customers_loan_personal_nonneg,
--   DROP CONSTRAINT IF EXISTS customers_loan_business_nonneg,
--   DROP CONSTRAINT IF EXISTS customers_loan_policy_fund_nonneg,
--   DROP COLUMN IF EXISTS call_notes, DROP COLUMN IF EXISTS certification_etc,
--   DROP COLUMN IF EXISTS certifications, DROP COLUMN IF EXISTS closure_memo,
--   DROP COLUMN IF EXISTS tax_delinquent_amount, DROP COLUMN IF EXISTS rehabilitation_memo,
--   DROP COLUMN IF EXISTS loan_personal, DROP COLUMN IF EXISTS loan_business,
--   DROP COLUMN IF EXISTS loan_policy_fund, DROP COLUMN IF EXISTS business_category;
-- COMMIT;
