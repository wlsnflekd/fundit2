-- ============================================================================
-- 0009_drop_customer_credit_rpc.sql
-- 신용·대출·사고 항목 민감 지정 해제 → credit RPC 3종 제거
-- ============================================================================
-- 배경: 2026-10-16 사용자 결정으로 KCB/NICE, 기존 대출 3종, 사고이력(+메모),
--       세금체납(+금액)을 일반 항목으로 전환. 프론트는 customers 일반 SELECT/UPDATE
--       경로로 조회·저장하며 get/update_customer_credit 를 더 이상 호출하지 않는다.
--       (해당 컬럼은 원래 authenticated 에 SELECT/UPDATE 권한이 있어 DB 변경 불필요)
--
-- 순서: 새 프론트 프로덕션 배포 확인 → 열려 있는 화면 새로고침 안내 → 이 SQL 실행
--       (배포 전 실행 시 구 프론트의 1차콜 탭에서 신용 항목 로드·저장이 실패함)
-- 롤백: supabase/migrations/0007_customer_call_log.sql 섹션 E 재실행
-- ============================================================================

BEGIN;

DROP FUNCTION IF EXISTS public.update_customer_credit(uuid, jsonb);
DROP FUNCTION IF EXISTS public.get_customer_credit(uuid);
-- 위 두 함수가 호출하던 권한 확인 함수 — 다른 사용처 없음 (2026-10-16 확인)
DROP FUNCTION IF EXISTS public.assert_customer_credit_access(uuid);

NOTIFY pgrst, 'reload schema';

COMMIT;

-- 검증 (실행 후) — 0행이어야 함
-- select proname from pg_proc
--  where pronamespace = 'public'::regnamespace
--    and proname in ('get_customer_credit', 'update_customer_credit', 'assert_customer_credit_access');
