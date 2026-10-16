-- ============================================================================
-- 0008_required_funds_unit.sql
-- 필요자금(required_funds) 단위를 만원으로 통일 + Apps Script 자동 입력 쓰레기값 정리
-- ============================================================================
-- 배경
--   화면(1차콜 탭)은 required_funds 를 "만원" 단위로 입력·표시한다.
--   그러나 Apps Script parseNumericSafe 가 AI예상금액 범위 문자열(예: "1,500만원5억원",
--   구분기호 없음)의 숫자를 모두 이어붙인 뒤 ×10000 해 저장해 왔다
--   ("1500"+"5" → 150,050,000 / "500"+"5000" → 50,050,000,000).
--   → 단위 변환으로 살릴 수 없는 값. AI 추정 범위는 필요자금(상담 시 확인값)과 의미도 다르며,
--     원문은 consultation_memo 의 [AI예상금액] 줄에 남아 있다.
--   Apps Script 는 2026-10-16 사용자가 requiredFunds = null 로 수정 완료.
--
-- 처리 (2026-10-16 조회 기준 946건)
--   A. NULL      : created_at >= 2026-04-20 AND 값 >= 1,000,000 (Apps Script 자동값)   937건
--   B. ÷10000    : created_at <  2026-04-20 AND 값 >= 1,000,000 (Airtable 이관, 원 단위)   2건
--   C. 유지      : 값 < 1,000,000 (이미 만원: 5000×5, 6000, 20000)                       7건
--   (기준일은 KST 자정. 04-19 15:00~04-20 09:10 UTC 구간에 해당 행이 없어 UTC 기준과 결과 동일)
--
-- 실행: Supabase SQL Editor 에서 파일 전체를 한 번에 실행 (단일 트랜잭션)
--       건수가 예상과 다르면 예외로 전체 롤백 → 재조회 후 기대값 갱신
--       939행 UPDATE → Realtime 이벤트 발생, 사용량 적은 시간대 권장
-- 순서: 프론트 변경 없음 (이미 만원 단위로 표시 중)
-- 롤백: 파일 하단 ROLLBACK 섹션 (백업 테이블에서 원래 값 복원)
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '5s';

-- ── 1. 백업 (변경 대상 939건의 원래 값) ──────────────────────────────────────
-- backup 스키마는 0007 에서 생성 (PostgREST 비노출, anon/authenticated 권한 없음)
CREATE SCHEMA IF NOT EXISTS backup;
REVOKE ALL ON SCHEMA backup FROM PUBLIC, anon, authenticated;

CREATE TABLE backup.customers_required_funds_0008 AS
SELECT id,
       required_funds AS old_value,
       CASE WHEN created_at >= '2026-04-20 00:00:00+09' THEN 'A_null' ELSE 'B_div10000' END AS action,
       now() AS backed_up_at
FROM public.customers
WHERE required_funds >= 1000000;

ALTER TABLE backup.customers_required_funds_0008 ADD PRIMARY KEY (id);
REVOKE ALL ON backup.customers_required_funds_0008 FROM PUBLIC, anon, authenticated;

-- ── 2. 건수 확인 (예상과 다르면 전체 롤백) ───────────────────────────────────
DO $$
DECLARE
  n_a int; n_b int; n_keep int;
BEGIN
  SELECT count(*) FILTER (WHERE action = 'A_null'),
         count(*) FILTER (WHERE action = 'B_div10000')
    INTO n_a, n_b
    FROM backup.customers_required_funds_0008;
  SELECT count(*) INTO n_keep
    FROM public.customers
   WHERE required_funds IS NOT NULL AND required_funds < 1000000;

  IF n_a <> 937 OR n_b <> 2 OR n_keep <> 7 THEN
    RAISE EXCEPTION '0008 건수 불일치: A_null=% (기대 937), B_div10000=% (기대 2), 유지=% (기대 7) — 재조회 후 기대값 갱신',
      n_a, n_b, n_keep;
  END IF;
END $$;

-- ── 3. 변환 ──────────────────────────────────────────────────────────────────
-- 백업 시점 값과 같을 때만 변경 (그 사이 직원이 수정한 값은 건드리지 않음)
UPDATE public.customers c
   SET required_funds = NULL
  FROM backup.customers_required_funds_0008 b
 WHERE c.id = b.id AND b.action = 'A_null'
   AND c.required_funds = b.old_value;

UPDATE public.customers c
   SET required_funds = round(b.old_value / 10000)
  FROM backup.customers_required_funds_0008 b
 WHERE c.id = b.id AND b.action = 'B_div10000'
   AND c.required_funds = b.old_value;

COMMENT ON COLUMN public.customers.required_funds IS
  '필요자금 (만원 단위). 상담 시 직원 입력값. AI예상금액은 consultation_memo 에 원문 보관 (0008)';

COMMIT;


-- ============================================================================
-- 검증 (실행 후 별도 실행) — 기대값을 주석으로 표기
-- ============================================================================
-- select count(required_funds)                              as non_null,  -- 9 (유지 7 + 변환 2)
--        count(*) filter (where required_funds >= 1000000)  as over_1e6,  -- 0
--        max(required_funds)                                as max_val    -- 20000
-- from public.customers;
-- select action, count(*) from backup.customers_required_funds_0008 group by 1;  -- A_null 937 / B_div10000 2
-- select c.required_funds, b.old_value from public.customers c
--   join backup.customers_required_funds_0008 b using (id) where b.action = 'B_div10000';
--   -- 4000 ← 40000000 / 10000 ← 100000000


-- ============================================================================
-- ROLLBACK (문제 발생 시) — 백업 값으로 복원
-- ============================================================================
-- BEGIN;
-- UPDATE public.customers c
--    SET required_funds = b.old_value
--   FROM backup.customers_required_funds_0008 b
--  WHERE c.id = b.id;
-- COMMENT ON COLUMN public.customers.required_funds IS NULL;
-- COMMIT;
-- (백업 테이블은 안정화 확인 후 별도로 DROP TABLE backup.customers_required_funds_0008;)
