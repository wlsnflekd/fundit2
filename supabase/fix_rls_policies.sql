-- fix_rls_policies.sql
-- Supabase Dashboard SQL Editor에서 실행하세요.
--
-- 문제 1: 기존 정책이 current_setting('request.jwt.claims.workspace_id') 사용 → 항상 NULL → 403
-- 문제 2: authenticated 역할에 테이블 GRANT 누락 → RLS와 무관하게 PostgREST 403
-- 해결: GRANT 추가 + auth.uid() 서브쿼리로 테넌트 격리

-- ── GRANT (403 Forbidden 핵심 원인) ─────────────────────────────────────────
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on all tables in schema public to anon;
grant usage, select on all sequences in schema public to authenticated;

-- 향후 생성되는 테이블에도 자동 적용
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public grant select on tables to anon;
alter default privileges in schema public grant usage, select on sequences to authenticated;

-- ── profiles ────────────────────────────────────────────────────────────────
-- 기존 정책 모두 제거 (이름 불문)
drop policy if exists "profiles_workspace" on profiles;
drop policy if exists "profiles_select" on profiles;
drop policy if exists "profiles_insert" on profiles;
drop policy if exists "profiles_update" on profiles;

alter table profiles enable row level security;

-- SELECT: 자신의 프로필 또는 같은 워크스페이스 멤버 조회 허용
create policy "profiles_select" on profiles for select using (
  id = auth.uid()
  OR workspace_id = (
    SELECT p.workspace_id FROM profiles p WHERE p.id = auth.uid()
  )
);

-- INSERT: 가입 시 자신의 id로만 삽입 가능 (service_role 또는 트리거도 허용)
create policy "profiles_insert" on profiles for insert with check (
  id = auth.uid()
);

-- UPDATE: 같은 워크스페이스 내 레코드만 수정 가능
create policy "profiles_update" on profiles for update using (
  workspace_id = (
    SELECT p.workspace_id FROM profiles p WHERE p.id = auth.uid()
  )
) with check (
  workspace_id = (
    SELECT p.workspace_id FROM profiles p WHERE p.id = auth.uid()
  )
);

-- ── workspaces ──────────────────────────────────────────────────────────────
drop policy if exists "workspaces_select" on workspaces;
drop policy if exists "workspaces_insert" on workspaces;
drop policy if exists "workspaces_update" on workspaces;

alter table workspaces enable row level security;

-- anon도 가입 시 workspace 생성이 필요하므로 INSERT 허용
create policy "workspaces_select" on workspaces for select using (true);
create policy "workspaces_insert" on workspaces for insert with check (true);
create policy "workspaces_update" on workspaces for update using (true) with check (true);

-- ── customers ────────────────────────────────────────────────────────────────
drop policy if exists "customers_workspace" on customers;

alter table customers enable row level security;

create policy "customers_workspace" on customers for all using (
  workspace_id = (
    SELECT p.workspace_id FROM profiles p WHERE p.id = auth.uid()
  )
) with check (
  workspace_id = (
    SELECT p.workspace_id FROM profiles p WHERE p.id = auth.uid()
  )
);

-- ── applications ─────────────────────────────────────────────────────────────
drop policy if exists "applications_workspace" on applications;

alter table applications enable row level security;

create policy "applications_workspace" on applications for all using (
  workspace_id = (
    SELECT p.workspace_id FROM profiles p WHERE p.id = auth.uid()
  )
) with check (
  workspace_id = (
    SELECT p.workspace_id FROM profiles p WHERE p.id = auth.uid()
  )
);

-- ── funds ────────────────────────────────────────────────────────────────────
drop policy if exists "funds_select" on funds;
drop policy if exists "funds_insert" on funds;

alter table funds enable row level security;

create policy "funds_select" on funds for select using (true);
create policy "funds_insert" on funds for insert with check (auth.role() = 'service_role');

-- ── notices ──────────────────────────────────────────────────────────────────
drop policy if exists "notices_select" on notices;
drop policy if exists "notices_insert" on notices;

alter table notices enable row level security;

create policy "notices_select" on notices for select using (true);
create policy "notices_insert" on notices for insert with check (auth.role() = 'service_role');
