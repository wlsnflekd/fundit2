-- !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
-- 경고: 이 파일은 절대 실행하지 마세요. 폐기된(OBSOLETE) 파일입니다.
--
-- 문제점:
--   1. profiles_insert 정책이 anon/authenticated 역할 전체에 INSERT를 허용합니다.
--      → 누구든 임의의 workspace_id로 profiles를 삽입할 수 있는 치명적 보안 결함입니다.
--   2. SELECT/UPDATE 정책이 current_setting('request.jwt.claims.workspace_id')를 사용합니다.
--      → Supabase에서 이 값은 항상 NULL이므로, 정책이 항상 false가 되어 403이 발생합니다.
--   3. superadmin bypass 조건이 없어 add_superadmin_approval.sql 마이그레이션과 충돌합니다.
--
-- 대신 사용해야 하는 파일:
--   - supabase/fix_rls_recursion.sql       (get_my_workspace_id SECURITY DEFINER 함수)
--   - supabase/add_superadmin_approval.sql (superadmin bypass RLS 정책)
--
-- 이 파일이 실수로 실행된 경우:
--   위 두 파일을 순서대로 다시 실행하면 복구됩니다.
-- !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

-- 아래 내용은 참고용으로만 보존합니다. 절대 실행하지 마세요.

/*
alter table profiles enable row level security;

drop policy if exists profiles_insert on profiles;
drop policy if exists profiles_workspace on profiles;
drop policy if exists profiles_update on profiles;

create policy profiles_insert on profiles for insert with check (
  auth.role() = 'service_role' OR
  auth.role() = 'anon' OR
  auth.role() = 'authenticated' OR
  id = auth.uid() OR
  workspace_id = current_setting('request.jwt.claims.workspace_id', true)::uuid
);

create policy profiles_workspace on profiles for select using (
  workspace_id = current_setting('request.jwt.claims.workspace_id', true)::uuid
);
create policy profiles_update on profiles for update using (
  workspace_id = current_setting('request.jwt.claims.workspace_id', true)::uuid
) with check (
  workspace_id = current_setting('request.jwt.claims.workspace_id', true)::uuid
);
*/
