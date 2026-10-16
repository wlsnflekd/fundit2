-- ============================================================================
-- 0012_certifications_none.sql
-- 보유 인증(certifications)에 '없음' 선택지 추가 — 다른 인증과 동시 선택 불가
-- ============================================================================
-- 배경: 1차콜 작성 상태 점등에서 "아무것도 선택 안 함(미작성)"과 "확인 결과 인증 없음(작성)"을
--       구분하기 위해 '없음'을 명시 선택지로 추가. NULL = 미작성.
--
-- 변경
--   1. customers_certifications_allowed: 허용값에 '없음' 추가 (0007 정의 교체)
--   2. customers_certifications_none_exclusive: '없음'은 단독으로만 허용 (['없음'] 만 가능)
--   3. customers_certifications_nonempty: 빈 배열 '{}' 금지 (미작성 = NULL)
--   (2026-10-16 확인: certifications 값이 있는 행 0건 → 모든 CHECK 통과)
--
-- 실행: Supabase SQL Editor 에서 파일 전체를 한 번에 실행 (단일 트랜잭션)
--       CHECK 재검증 = 전체 스캔(2.9천 행), 데이터 변경 없음
-- 순서: 이 SQL 적용 → 프론트 배포 (먼저 배포하면 '없음' 저장 시 CHECK 위반 400)
-- 롤백: 파일 하단 ROLLBACK 섹션
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '5s';

ALTER TABLE public.customers
  DROP CONSTRAINT customers_certifications_allowed,
  ADD CONSTRAINT customers_certifications_allowed CHECK (
    certifications IS NULL
    OR certifications <@ ARRAY['특허','ISO','벤처','이노비즈','메인비즈','기업부설연구소','기타','없음']::text[]
  ),
  ADD CONSTRAINT customers_certifications_none_exclusive CHECK (
    certifications IS NULL
    OR NOT ('없음' = ANY (certifications))
    OR certifications = ARRAY['없음']::text[]
  ),
  -- 빈 배열 금지: 미작성은 NULL 로만 표현 (REST·Make 등에서 '{}' 저장 방지)
  ADD CONSTRAINT customers_certifications_nonempty CHECK (
    certifications IS NULL OR cardinality(certifications) >= 1
  );

COMMENT ON COLUMN public.customers.certifications IS
  '보유 인증 (다중선택). NULL=미작성, [''없음'']=확인 결과 없음(단독). 허용값은 CHECK customers_certifications_allowed (0012)';

COMMIT;


-- ============================================================================
-- 검증 (실행 후 별도 실행)
-- ============================================================================
-- select conname, pg_get_constraintdef(oid) from pg_constraint
--  where conrelid = 'public.customers'::regclass and conname like 'customers_certifications%';
--   -- 3행: allowed (… '없음' 포함), none_exclusive, nonempty


-- ============================================================================
-- ROLLBACK (문제 발생 시) — '없음'이 저장된 행이 있으면 먼저 NULL 로 되돌려야 함
-- ============================================================================
-- BEGIN;
-- UPDATE public.customers SET certifications = NULL WHERE certifications = ARRAY['없음']::text[];
-- ALTER TABLE public.customers
--   DROP CONSTRAINT IF EXISTS customers_certifications_nonempty,
--   DROP CONSTRAINT IF EXISTS customers_certifications_none_exclusive,
--   DROP CONSTRAINT customers_certifications_allowed,
--   ADD CONSTRAINT customers_certifications_allowed CHECK (
--     certifications IS NULL
--     OR certifications <@ ARRAY['특허','ISO','벤처','이노비즈','메인비즈','기업부설연구소','기타']::text[]
--   );
-- COMMIT;
