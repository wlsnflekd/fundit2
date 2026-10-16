-- ============================================================================
-- 0011_business_type_normalize.sql
-- 사업자형태(business_type) 표준값 통일: '개인사업자' / '법인사업자' / NULL
-- ============================================================================
-- 현황 (2026-10-16 조회)
--   개인사업자 1,993 / 법인사업자 201 / NULL 676 / '개인' 47 / '법인' 4
--   '개인'·'법인' 51건은 모두 2026-04-08 같은 1분 안에 생성 = Airtable 일괄 이관
--   (scripts/migrate_airtable.mjs: row['사업자형태'] 원문 그대로 저장). 이후 유입분은 전부 표준값.
--
-- 섹션
--   A. 백업 후 '개인'→'개인사업자', '법인'→'법인사업자' (51건)
--   B. 정규화 함수 + BEFORE INSERT/UPDATE 트리거 — 어떤 유입 경로(화면, submit_customer_form RPC,
--      Apps Script, Make, REST)든 저장 시점에 표준값으로 변환
--        공백 제거 후  '개인…' / '간이…' / '일반과세…' → 개인사업자
--                      '법인…'                        → 법인사업자
--                      빈칸 / 그 외                    → NULL (미선택으로 저장, 유입 자체는 막지 않음)
--   C. CHECK 제약 — 트리거가 없어지더라도 비표준 값이 들어오지 않도록 최종 방어
--
-- 실행: Supabase SQL Editor 에서 파일 전체를 한 번에 실행 (단일 트랜잭션)
--       51행 UPDATE + CHECK 검증(전체 스캔, 2.9천 행) — 영향 작음
-- 순서: 프론트 변경 없음 (화면 선택지는 이미 표준값 2개)
-- 롤백: 파일 하단 ROLLBACK 섹션
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '5s';

-- ── A. 백업 + 기존 데이터 변환 ───────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS backup;
REVOKE ALL ON SCHEMA backup FROM PUBLIC, anon, authenticated;

CREATE TABLE backup.customers_business_type_0011 AS
SELECT id, business_type AS old_value, now() AS backed_up_at
FROM public.customers
WHERE business_type IS NOT NULL
  AND business_type NOT IN ('개인사업자', '법인사업자');

ALTER TABLE backup.customers_business_type_0011 ADD PRIMARY KEY (id);
REVOKE ALL ON backup.customers_business_type_0011 FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  n_total int; n_personal int; n_corp int;
BEGIN
  SELECT count(*),
         count(*) FILTER (WHERE old_value = '개인'),
         count(*) FILTER (WHERE old_value = '법인')
    INTO n_total, n_personal, n_corp
    FROM backup.customers_business_type_0011;
  IF n_total <> 51 OR n_personal <> 47 OR n_corp <> 4 THEN
    RAISE EXCEPTION '0011 건수 불일치: 전체=% (기대 51), 개인=% (기대 47), 법인=% (기대 4) — 재조회 후 기대값 갱신',
      n_total, n_personal, n_corp;
  END IF;
END $$;

-- ── B. 정규화 함수 + 트리거 ──────────────────────────────────────────────────
-- JS 쪽은 화면 선택지가 표준값뿐이라 별도 파서 없음 (region 의 parse_sido 와 달리 SQL 단독 규칙)
CREATE OR REPLACE FUNCTION public.normalize_business_type(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN v IS NULL OR v = ''                                   THEN NULL
    WHEN v LIKE '개인%' OR v LIKE '간이%' OR v LIKE '일반과세%' THEN '개인사업자'
    WHEN v LIKE '법인%'                                        THEN '법인사업자'
    ELSE NULL
  END
  -- 일반 공백 + NBSP(U+00A0) + 전각 공백(U+3000) 제거
  FROM (SELECT regexp_replace(coalesce(p, ''), '[\s' || chr(160) || chr(12288) || ']', '', 'g') AS v) s
$$;

CREATE OR REPLACE FUNCTION public.customers_normalize_business_type()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.business_type := public.normalize_business_type(NEW.business_type);
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.customers_normalize_business_type() FROM PUBLIC, anon;

CREATE TRIGGER trg_customers_normalize_business_type
  BEFORE INSERT OR UPDATE OF business_type ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.customers_normalize_business_type();

-- 기존 51건 변환 — 트리거가 같은 규칙으로 값을 바꿈 (백업 시점 값과 같을 때만)
UPDATE public.customers c
   SET business_type = public.normalize_business_type(b.old_value)
  FROM backup.customers_business_type_0011 b
 WHERE c.id = b.id
   AND c.business_type = b.old_value;

-- ── C. CHECK 제약 (최종 방어) ────────────────────────────────────────────────
ALTER TABLE public.customers
  ADD CONSTRAINT customers_business_type_check
  CHECK (business_type IS NULL OR business_type IN ('개인사업자', '법인사업자'));

COMMENT ON COLUMN public.customers.business_type IS
  '사업자형태: 개인사업자 / 법인사업자 / NULL(미선택). 트리거 trg_customers_normalize_business_type 가 저장 시 정규화 (0011)';

COMMIT;


-- ============================================================================
-- 검증 (실행 후 별도 실행)
-- ============================================================================
-- select coalesce(business_type, '(null)') bt, count(*) from public.customers group by 1 order by 1;
--   -- 개인사업자 2,040 / 법인사업자 205 / (null) 676
-- select count(*) from backup.customers_business_type_0011;   -- 51
-- select public.normalize_business_type(x)
--   from unnest(array['개인', ' 개인 사업자', '간이과세자', '일반과세자', '법인', '법인사업자', '', '기타']) x;
--   -- 개인사업자, 개인사업자, 개인사업자, 개인사업자, 법인사업자, 법인사업자, NULL, NULL
-- (51건 UPDATE 시 지역 트리거도 실행됨 — 상세지역이 비어 있고 주소로 판별 가능한 행은 상세지역이 채워질 수 있음, 0005 계약과 동일)


-- ============================================================================
-- ROLLBACK (문제 발생 시)
-- ============================================================================
-- BEGIN;
-- ALTER TABLE public.customers DROP CONSTRAINT IF EXISTS customers_business_type_check;
-- DROP TRIGGER IF EXISTS trg_customers_normalize_business_type ON public.customers;
-- DROP FUNCTION IF EXISTS public.customers_normalize_business_type();
-- DROP FUNCTION IF EXISTS public.normalize_business_type(text);
-- UPDATE public.customers c SET business_type = b.old_value
--   FROM backup.customers_business_type_0011 b
--  WHERE c.id = b.id
--    AND c.business_type = CASE b.old_value WHEN '개인' THEN '개인사업자' WHEN '법인' THEN '법인사업자' END;
--   -- 0011 이후 직원이 다시 고친 행은 건드리지 않음
-- COMMENT ON COLUMN public.customers.business_type IS NULL;
-- COMMIT;
