-- fix_rls_recursion.sql
-- 문제: profiles SELECT/UPDATE 정책이 profiles 자신을 서브쿼리로 참조 → 무한 재귀
-- 해결: security definer 함수로 RLS를 우회하여 workspace_id를 조회

begin;

-- ── 1. helper 함수 생성 ────────────────────────────────────────────────────────
-- security definer: 함수 소유자(superuser) 권한으로 실행되므로 RLS 미적용
-- stable: 동일 트랜잭션 내 동일 입력에 대해 결과 캐시 가능 → 성능 이점
-- set search_path = public: 함수 하이재킹 방지
create or replace function get_my_workspace_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select workspace_id from profiles where id = auth.uid()
$$;

grant execute on function get_my_workspace_id() to authenticated;

-- ── 2. 재귀를 유발하는 기존 정책 제거 ─────────────────────────────────────────
drop policy if exists "profiles_select" on profiles;
drop policy if exists "profiles_update" on profiles;

-- ── 3. 재귀 없는 정책으로 교체 ────────────────────────────────────────────────
-- SELECT: 자신의 레코드(id = auth.uid()) 또는 같은 워크스페이스 멤버
-- get_my_workspace_id()는 RLS를 거치지 않으므로 재귀 없음
create policy "profiles_select" on profiles for select using (
  id = auth.uid()
  or workspace_id = get_my_workspace_id()
);

-- UPDATE: 같은 워크스페이스 내 레코드만 수정 가능
create policy "profiles_update" on profiles for update using (
  workspace_id = get_my_workspace_id()
) with check (
  workspace_id = get_my_workspace_id()
);

commit;
