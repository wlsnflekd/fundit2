-- ============================================================================
-- 0013_duplicate_leads.sql
-- 중복(재문의) 리드: 같은 번호도 새 고객 카드로 생성 + 중복 표시·최초 고객 연결·회차·이전 담당
-- ============================================================================
-- 결정사항 (2026-10-16)
--   1. 번호는 숫자만 비교 (phone_digits). 기존 숫자 기준 중복 2쌍도 중복 카드로 정리
--   2. 이전 담당 = 재유입 시점 직전 카드의 담당자를 저장 (previous_consultant, 스냅샷)
--   3. 화면 직접 등록: 확인창 후 중복 카드로 등록 (10분 규칙 미적용) — 판정은 이 트리거가 담당
--   4. 번호 수정 충돌은 유니크 위반 → 화면에서 "이미 등록된 번호입니다" 표시
--   5. submit_customer_form: 같은 번호도 새 행 생성(상태 '신규', 담당 미배정, 이전 정보 복사 없음).
--      단, 같은 번호가 10분 이내 재유입되면 생성하지 않음 (Apps Script·Make 재시도 방지)
--      응답: jsonb {"id", "status": created | duplicate | recent_duplicate, "duplicate_count"}
--
-- 섹션
--   A. 컬럼 추가 (phone_digits 생성 컬럼, is_duplicate, original_customer_id, duplicate_seq, previous_consultant)
--   B. 기존 데이터: 숫자 기준 중복 2쌍 → 나중 행을 중복 카드로 (백업 포함)
--   C. 유니크 교체: UNIQUE(workspace_id, phone) → 최초 고객만 유일 (부분 유니크, phone_digits 기준)
--   D. BEFORE INSERT 트리거: 모든 유입 경로에서 중복 판정 (클라이언트가 보낸 값은 무시)
--   E. submit_customer_form 재생성 (반환 타입 uuid → jsonb 이므로 DROP 후 CREATE)
--
-- 실행: Supabase SQL Editor 에서 파일 전체를 한 번에 실행 (단일 트랜잭션)
--       ADD COLUMN ... GENERATED STORED = 테이블 재작성(2.9천 행, ACCESS EXCLUSIVE 짧게) → 사용량 적은 시간대
-- 순서: 이 SQL 적용 → 프론트 배포 → Apps Script callSubmitRpc 수정
--       (Apps Script 수정 전까지 중복 카드는 시트에 '✅'로 표기됨 — 등록 자체는 정상)
-- 롤백: 파일 하단 ROLLBACK 섹션
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '5s';

-- ── A. 컬럼 ──────────────────────────────────────────────────────────────────
ALTER TABLE public.customers
  ADD COLUMN phone_digits text
    GENERATED ALWAYS AS (nullif(regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g'), '')) STORED,
  ADD COLUMN is_duplicate         boolean NOT NULL DEFAULT false,
  ADD COLUMN original_customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  ADD COLUMN duplicate_seq        integer,
  ADD COLUMN previous_consultant  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD CONSTRAINT customers_duplicate_seq_check CHECK (
    (NOT is_duplicate AND duplicate_seq IS NULL) OR (is_duplicate AND duplicate_seq >= 1)
  );

COMMENT ON COLUMN public.customers.phone_digits IS '전화번호 숫자만 (중복 판정 기준, 자동 계산) (0013)';
COMMENT ON COLUMN public.customers.is_duplicate IS '재문의로 생성된 중복 카드 여부 (트리거가 판정) (0013)';
COMMENT ON COLUMN public.customers.original_customer_id IS '같은 번호의 최초 고객 (0013)';
COMMENT ON COLUMN public.customers.duplicate_seq IS '재문의 회차: 1 = 첫 재문의 (0013)';
COMMENT ON COLUMN public.customers.previous_consultant IS '재유입 시점 직전 카드의 담당자 스냅샷 (0013)';

-- ── B. 기존 숫자 기준 중복 → 나중 행을 중복 카드로 ─────────────────────────────
CREATE SCHEMA IF NOT EXISTS backup;
REVOKE ALL ON SCHEMA backup FROM PUBLIC, anon, authenticated;

CREATE TABLE backup.customers_duplicates_0013 AS
WITH ranked AS (
  SELECT id, workspace_id, phone, phone_digits, consultant, created_at,
         row_number() OVER w AS rn,
         first_value(id)  OVER w AS first_id,
         lag(consultant)  OVER w AS prev_consultant
  FROM public.customers
  WHERE phone_digits IS NOT NULL
  WINDOW w AS (PARTITION BY workspace_id, phone_digits ORDER BY created_at, id)
)
SELECT id, phone, phone_digits, first_id AS original_customer_id,
       (rn - 1)::int AS duplicate_seq, prev_consultant AS previous_consultant, now() AS backed_up_at
FROM ranked
WHERE rn > 1;

ALTER TABLE backup.customers_duplicates_0013 ADD PRIMARY KEY (id);
REVOKE ALL ON backup.customers_duplicates_0013 FROM PUBLIC, anon, authenticated;

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM backup.customers_duplicates_0013;
  IF n <> 2 THEN
    RAISE EXCEPTION '0013 기존 중복 건수 불일치: % (기대 2) — 재조회 후 기대값 갱신', n;
  END IF;
END $$;

UPDATE public.customers c
   SET is_duplicate = true,
       original_customer_id = b.original_customer_id,
       duplicate_seq = b.duplicate_seq,
       previous_consultant = b.previous_consultant
  FROM backup.customers_duplicates_0013 b
 WHERE c.id = b.id;

-- ── C. 유니크 교체 ──────────────────────────────────────────────────────────
-- submit_customer_form 의 ON CONFLICT (workspace_id, phone) 이 이 제약에 의존 → E 에서 함께 교체
ALTER TABLE public.customers DROP CONSTRAINT customers_workspace_phone_unique;

-- 최초 고객(중복 아님)만 번호(숫자 기준) 유일
CREATE UNIQUE INDEX customers_original_phone_unique
  ON public.customers (workspace_id, phone_digits)
  WHERE NOT is_duplicate AND phone_digits IS NOT NULL;

-- 중복 판정·10분 규칙·화면 사전 조회용
CREATE INDEX customers_phone_lookup_idx
  ON public.customers (workspace_id, phone_digits, created_at DESC)
  WHERE phone_digits IS NOT NULL;

-- 중복 고객 필터·집계용
CREATE INDEX customers_is_duplicate_idx
  ON public.customers (workspace_id)
  WHERE is_duplicate;

-- ── D. 중복 판정 트리거 ─────────────────────────────────────────────────────
-- SECURITY DEFINER: 호출자의 RLS 범위와 무관하게 같은 워크스페이스 전체에서 판정
--   (읽는 범위는 NEW.workspace_id 로 한정, 다른 워크스페이스로의 INSERT 는 customers RLS WITH CHECK 가 차단)
-- 번호별 advisory lock: 같은 번호 동시 유입 시 둘 다 '최초'가 되는 경쟁 방지
-- 생성 컬럼(phone_digits)은 BEFORE 트리거 시점에 아직 계산 전 → 같은 식으로 직접 계산
CREATE OR REPLACE FUNCTION public.customers_mark_duplicate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_digits   text;
  v_count    int;
  v_maxseq   int;
  v_original uuid;
  v_prev     uuid;
BEGIN
  -- 클라이언트가 보낸 값은 무시하고 항상 DB가 판정
  NEW.is_duplicate         := false;
  NEW.original_customer_id := NULL;
  NEW.duplicate_seq        := NULL;
  NEW.previous_consultant  := NULL;

  v_digits := nullif(regexp_replace(coalesce(NEW.phone, ''), '[^0-9]', '', 'g'), '');
  IF v_digits IS NULL OR NEW.workspace_id IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('customers_phone:' || NEW.workspace_id::text || ':' || v_digits, 0));

  SELECT count(*), coalesce(max(duplicate_seq), 0) INTO v_count, v_maxseq
    FROM public.customers
   WHERE workspace_id = NEW.workspace_id AND phone_digits = v_digits;

  IF v_count = 0 THEN
    RETURN NEW;
  END IF;

  -- 최초 고객: 중복 아닌 행 (최초 고객이 삭제됐으면 가장 오래된 행)
  SELECT id INTO v_original
    FROM public.customers
   WHERE workspace_id = NEW.workspace_id AND phone_digits = v_digits
   ORDER BY is_duplicate, created_at, id
   LIMIT 1;

  -- 직전 카드의 현재 담당자 (재유입 시점 스냅샷)
  SELECT consultant INTO v_prev
    FROM public.customers
   WHERE workspace_id = NEW.workspace_id AND phone_digits = v_digits
   ORDER BY created_at DESC, id DESC
   LIMIT 1;

  NEW.is_duplicate         := true;
  NEW.original_customer_id := v_original;
  -- 회차 = 기존 행 수. 중간 카드가 삭제돼도 회차가 겹치지 않도록 기존 최대 회차 + 1 이상
  NEW.duplicate_seq        := greatest(v_count, v_maxseq + 1);
  NEW.previous_consultant  := v_prev;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.customers_mark_duplicate() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_customers_mark_duplicate
  BEFORE INSERT ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.customers_mark_duplicate();

-- 앱 사용자(authenticated/anon)는 UPDATE 로 중복 컬럼을 바꿀 수 없음
--   (is_duplicate 를 켜서 부분 유니크를 우회하거나, 다른 워크스페이스 고객을 original 로 지정하는 것 방지)
-- SQL Editor(postgres)·service_role 은 정정 가능
CREATE OR REPLACE FUNCTION public.customers_guard_duplicate_cols()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon') THEN
    NEW.is_duplicate         := OLD.is_duplicate;
    NEW.original_customer_id := OLD.original_customer_id;
    NEW.duplicate_seq        := OLD.duplicate_seq;
    NEW.previous_consultant  := OLD.previous_consultant;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.customers_guard_duplicate_cols() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_customers_guard_duplicate_cols
  BEFORE UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.customers_guard_duplicate_cols();

-- ── E. submit_customer_form 재생성 (uuid → jsonb) ───────────────────────────
-- 변경점: ON CONFLICT 스킵 제거 / 10분 이내 같은 번호는 생성 안 함 / jsonb 응답
-- 유지: 인자·기본값, 워크스페이스 화이트리스트, 업체명 필수, 상태 '신규'·담당 미배정, 권한
DROP FUNCTION public.submit_customer_form(uuid, text, text, text, text, text, text, text, text, boolean, numeric, text, text[], date, text);

CREATE FUNCTION public.submit_customer_form(
  p_workspace_id uuid, p_company text, p_phone text DEFAULT NULL::text,
  p_lead_source text DEFAULT NULL::text, p_business_type text DEFAULT NULL::text,
  p_industry text DEFAULT NULL::text, p_region text DEFAULT NULL::text,
  p_business_age text DEFAULT NULL::text, p_monthly_revenue text DEFAULT NULL::text,
  p_tax_delinquent boolean DEFAULT NULL::boolean, p_required_funds numeric DEFAULT NULL::numeric,
  p_consultation_memo text DEFAULT NULL::text, p_tags text[] DEFAULT NULL::text[],
  p_received_date date DEFAULT NULL::date, p_business_reg_no text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_allowed_ws uuid := 'a1650b9e-31da-43e6-9179-17390d06f58c';
  v_digits     text;
  v_recent     record;
  v_new        record;
BEGIN
  IF p_workspace_id IS DISTINCT FROM v_allowed_ws THEN
    RAISE EXCEPTION '허용되지 않은 워크스페이스입니다.';
  END IF;
  IF p_company IS NULL OR trim(p_company) = '' THEN
    RAISE EXCEPTION '업체명은 필수 입력값입니다.';
  END IF;

  v_digits := nullif(regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g'), '');

  IF v_digits IS NOT NULL THEN
    -- 트리거와 같은 잠금 → 동시 재시도 2건이 모두 10분 규칙을 통과하는 경쟁 방지
    PERFORM pg_advisory_xact_lock(hashtextextended('customers_phone:' || p_workspace_id::text || ':' || v_digits, 0));

    SELECT id, is_duplicate, duplicate_seq INTO v_recent
      FROM public.customers
     WHERE workspace_id = p_workspace_id
       AND phone_digits = v_digits
       AND created_at > now() - interval '10 minutes'
     ORDER BY created_at DESC
     LIMIT 1;

    IF FOUND THEN
      RETURN jsonb_build_object(
        'id', v_recent.id,
        'status', 'recent_duplicate',
        'duplicate_count', coalesce(v_recent.duplicate_seq, 0)
      );
    END IF;
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
  RETURNING id, is_duplicate, duplicate_seq INTO v_new;

  RETURN jsonb_build_object(
    'id', v_new.id,
    'status', CASE WHEN v_new.is_duplicate THEN 'duplicate' ELSE 'created' END,
    'duplicate_count', coalesce(v_new.duplicate_seq, 0)
  );
END;
$function$;

-- 기존과 동일한 실행 권한 (PUBLIC 포함 — Apps Script 는 anon 키로 호출)
GRANT EXECUTE ON FUNCTION public.submit_customer_form(uuid, text, text, text, text, text, text, text, text, boolean, numeric, text, text[], date, text)
  TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;


-- ============================================================================
-- 검증 (실행 후 별도 실행)
-- ============================================================================
-- select count(*) filter (where is_duplicate) as dup, count(*) filter (where not is_duplicate) as orig,
--        count(*) filter (where phone_digits is null) as no_phone
-- from public.customers;                                    -- dup 2 / orig 2,920 / no_phone 5 (2026-10-16 기준 총 2,922)
-- select indexname from pg_indexes where tablename = 'customers' and indexname like 'customers_%phone%';
--   -- customers_original_phone_unique, customers_phone_lookup_idx
-- select pg_get_function_result('public.submit_customer_form(uuid,text,text,text,text,text,text,text,text,boolean,numeric,text,text[],date,text)'::regprocedure);
--   -- jsonb


-- ============================================================================
-- ROLLBACK (문제 발생 시)
--   주의: 0013 이후 생성된 중복 카드가 있으면 UNIQUE(workspace_id, phone) 복원이 실패함
--         → 중복 카드를 먼저 정리(삭제 또는 번호 변경)해야 함
-- ============================================================================
-- BEGIN;
-- DROP TRIGGER IF EXISTS trg_customers_guard_duplicate_cols ON public.customers;
-- DROP FUNCTION IF EXISTS public.customers_guard_duplicate_cols();
-- DROP TRIGGER IF EXISTS trg_customers_mark_duplicate ON public.customers;
-- DROP FUNCTION IF EXISTS public.customers_mark_duplicate();
-- DROP INDEX IF EXISTS public.customers_original_phone_unique;
-- DROP INDEX IF EXISTS public.customers_phone_lookup_idx;
-- DROP INDEX IF EXISTS public.customers_is_duplicate_idx;
-- ALTER TABLE public.customers ADD CONSTRAINT customers_workspace_phone_unique UNIQUE (workspace_id, phone);
-- DROP FUNCTION public.submit_customer_form(uuid, text, text, text, text, text, text, text, text, boolean, numeric, text, text[], date, text);
-- (0007 섹션 D 의 submit_customer_form 정의 재실행 — RETURNS uuid, ON CONFLICT (workspace_id, phone) DO NOTHING)
-- ALTER TABLE public.customers
--   DROP CONSTRAINT IF EXISTS customers_duplicate_seq_check,
--   DROP COLUMN IF EXISTS previous_consultant, DROP COLUMN IF EXISTS duplicate_seq,
--   DROP COLUMN IF EXISTS original_customer_id, DROP COLUMN IF EXISTS is_duplicate,
--   DROP COLUMN IF EXISTS phone_digits;
-- NOTIFY pgrst, 'reload schema';
-- COMMIT;
