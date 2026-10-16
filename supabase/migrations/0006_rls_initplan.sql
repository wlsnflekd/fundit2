-- ============================================================================
-- 0006_rls_initplan.sql
-- RLS 정책의 함수 호출을 (select ...) 로 감싸 initPlan(쿼리당 1회 평가)으로 전환
-- ============================================================================
--
-- 배경 (2026-10-16 장애 분석)
--   customers 등 정책이 `is_superadmin() OR workspace_id = get_my_workspace_id()` 처럼
--   함수를 직접 호출하고 있어 Postgres 가 "행마다" 함수를 실행 → 매 행 profiles 조회.
--   profiles(10행) seq_scan 누적 1억 회, 고객사 2.9천 행 검색 평균 1~2초.
--   동일 조건 측정: per-row 155.6ms → initPlan 22.3ms (약 7배).
--
-- 원칙
--   - 정책 의미(조건식·대상 명령·roles)는 그대로. 함수 호출만 (select f()) 로 감쌈.
--   - DROP/CREATE 대신 ALTER POLICY 사용 → 정책 공백 구간 없음, cmd/roles/permissive 보존.
--   - get_my_workspace_id() / is_superadmin() 함수 자체는 변경하지 않음
--     (SECURITY DEFINER 유지 — profiles RLS 재귀 방지, CLAUDE.md §14).
--   - auth.uid() / auth.role() 도 동일하게 (select ...) 로 감쌈 (Supabase 권장 패턴).
--   - 조건이 `true` 인 정책(funds/notices/workspaces select, workspaces insert)은 변경 없음.
--
-- 실행: Supabase SQL Editor 에서 파일 전체를 한 번에 실행 (트랜잭션으로 원자 적용)
-- 롤백: 파일 하단 ROLLBACK 섹션 참고
-- ============================================================================

BEGIN;

-- ALTER POLICY 는 대상 테이블에 ACCESS EXCLUSIVE 락을 잡음. 장기 쿼리에 막혀 대기열이
-- 쌓이는 것을 방지: 5초 내 락 못 잡으면 전체 롤백(안전) → 한가한 시간에 재실행.
SET LOCAL lock_timeout = '5s';

-- ── applications ────────────────────────────────────────────────────────────
ALTER POLICY applications_workspace ON public.applications
  USING      ((select public.is_superadmin()) OR workspace_id = (select public.get_my_workspace_id()))
  WITH CHECK ((select public.is_superadmin()) OR workspace_id = (select public.get_my_workspace_id()));

-- ── customers ───────────────────────────────────────────────────────────────
ALTER POLICY customers_workspace ON public.customers
  USING      ((select public.is_superadmin()) OR workspace_id = (select public.get_my_workspace_id()))
  WITH CHECK ((select public.is_superadmin()) OR workspace_id = (select public.get_my_workspace_id()));

-- ── schedules ───────────────────────────────────────────────────────────────
ALTER POLICY schedules_workspace ON public.schedules
  USING      (workspace_id = (select public.get_my_workspace_id()))
  WITH CHECK (workspace_id = (select public.get_my_workspace_id()));

-- ── notifications ───────────────────────────────────────────────────────────
ALTER POLICY notifications_insert ON public.notifications
  WITH CHECK (workspace_id = (select public.get_my_workspace_id()));

ALTER POLICY notifications_select ON public.notifications
  USING (user_id = (select auth.uid()));

ALTER POLICY notifications_update ON public.notifications
  USING (user_id = (select auth.uid()));

-- ── profiles ────────────────────────────────────────────────────────────────
-- profiles_insert 의 조건(id = auth.uid())은 의미 동일, 래핑만 적용 (CLAUDE.md §14 조건 유지)
ALTER POLICY profiles_insert ON public.profiles
  WITH CHECK (id = (select auth.uid()));

ALTER POLICY profiles_select ON public.profiles
  USING ((select public.is_superadmin()) OR id = (select auth.uid()) OR workspace_id = (select public.get_my_workspace_id()));

ALTER POLICY profiles_update ON public.profiles
  USING      ((select public.is_superadmin()) OR workspace_id = (select public.get_my_workspace_id()))
  WITH CHECK ((select public.is_superadmin()) OR workspace_id = (select public.get_my_workspace_id()));

-- ── workspaces ──────────────────────────────────────────────────────────────
ALTER POLICY workspaces_update ON public.workspaces
  USING      ((select public.is_superadmin()) OR id = (select public.get_my_workspace_id()))
  WITH CHECK ((select public.is_superadmin()) OR id = (select public.get_my_workspace_id()));

ALTER POLICY workspaces_delete ON public.workspaces
  USING ((select public.is_superadmin()));

-- ── funds ───────────────────────────────────────────────────────────────────
ALTER POLICY funds_insert ON public.funds
  WITH CHECK ((select auth.role()) = 'service_role' OR (select public.is_superadmin()));

ALTER POLICY funds_update ON public.funds
  USING ((select auth.role()) = 'service_role' OR (select public.is_superadmin()));

ALTER POLICY funds_delete ON public.funds
  USING ((select auth.role()) = 'service_role' OR (select public.is_superadmin()));

-- ── notices ─────────────────────────────────────────────────────────────────
ALTER POLICY notices_insert ON public.notices
  WITH CHECK ((select auth.role()) = 'service_role' OR (select public.is_superadmin()));

ALTER POLICY notices_update ON public.notices
  USING ((select auth.role()) = 'service_role' OR (select public.is_superadmin()));

ALTER POLICY notices_delete ON public.notices
  USING ((select auth.role()) = 'service_role' OR (select public.is_superadmin()));

COMMIT;


-- ============================================================================
-- 검증 (실행 후 SQL Editor 에서 별도 실행)
-- ============================================================================
-- 1) 함수 호출이 모두 래핑되었는지: 아래 결과가 0행이어야 함
--    pg_policies 는 래핑된 호출을 `( SELECT is_superadmin() AS is_superadmin)` /
--    `( SELECT auth.uid() AS uid)` 로 출력함. 래핑된 호출을 먼저 지운 뒤 남은 호출을 찾음
--    (lookbehind 대신 strip 방식 — `public.` 접두어 유무와 무관하게 동작).
-- select tablename, policyname, qual, with_check
-- from pg_policies
-- where schemaname = 'public'
--   and regexp_replace(
--         coalesce(qual,'') || ' ' || coalesce(with_check,''),
--         'SELECT (public\.)?(is_superadmin|get_my_workspace_id|auth\.uid|auth\.role)\(\)',
--         '', 'gi')
--       ~* '(is_superadmin|get_my_workspace_id|auth\.uid|auth\.role)\(\)';
--
-- 2) 통계 초기화 → 하루 사용 후 상위 쿼리 재비교
-- select pg_stat_statements_reset();


-- ============================================================================
-- ROLLBACK (문제 발생 시에만 실행 — 0006 이전 정의로 복원)
-- ============================================================================
-- BEGIN;
-- ALTER POLICY applications_workspace ON public.applications
--   USING (is_superadmin() OR workspace_id = get_my_workspace_id())
--   WITH CHECK (is_superadmin() OR workspace_id = get_my_workspace_id());
-- ALTER POLICY customers_workspace ON public.customers
--   USING (is_superadmin() OR workspace_id = get_my_workspace_id())
--   WITH CHECK (is_superadmin() OR workspace_id = get_my_workspace_id());
-- ALTER POLICY schedules_workspace ON public.schedules
--   USING (workspace_id = get_my_workspace_id())
--   WITH CHECK (workspace_id = get_my_workspace_id());
-- ALTER POLICY notifications_insert ON public.notifications WITH CHECK (workspace_id = get_my_workspace_id());
-- ALTER POLICY notifications_select ON public.notifications USING (user_id = auth.uid());
-- ALTER POLICY notifications_update ON public.notifications USING (user_id = auth.uid());
-- ALTER POLICY profiles_insert ON public.profiles WITH CHECK (id = auth.uid());
-- ALTER POLICY profiles_select ON public.profiles
--   USING (is_superadmin() OR id = auth.uid() OR workspace_id = get_my_workspace_id());
-- ALTER POLICY profiles_update ON public.profiles
--   USING (is_superadmin() OR workspace_id = get_my_workspace_id())
--   WITH CHECK (is_superadmin() OR workspace_id = get_my_workspace_id());
-- ALTER POLICY workspaces_update ON public.workspaces
--   USING (is_superadmin() OR id = get_my_workspace_id())
--   WITH CHECK (is_superadmin() OR id = get_my_workspace_id());
-- ALTER POLICY workspaces_delete ON public.workspaces USING (is_superadmin());
-- ALTER POLICY funds_insert ON public.funds WITH CHECK (auth.role() = 'service_role' OR is_superadmin());
-- ALTER POLICY funds_update ON public.funds USING (auth.role() = 'service_role' OR is_superadmin());
-- ALTER POLICY funds_delete ON public.funds USING (auth.role() = 'service_role' OR is_superadmin());
-- ALTER POLICY notices_insert ON public.notices WITH CHECK (auth.role() = 'service_role' OR is_superadmin());
-- ALTER POLICY notices_update ON public.notices USING (auth.role() = 'service_role' OR is_superadmin());
-- ALTER POLICY notices_delete ON public.notices USING (auth.role() = 'service_role' OR is_superadmin());
-- COMMIT;
