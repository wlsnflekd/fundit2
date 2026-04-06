-- delete_workspace.sql
-- 목적: 슈퍼관리자 전용 워크스페이스 완전 삭제 RPC
--
-- 삭제 순서 (FK ON DELETE CASCADE 의존):
--   1. applications (workspace_id FK → cascade)
--   2. customers    (workspace_id FK → cascade)
--   3. profiles     (workspace_id FK → cascade)
--   4. workspaces   (직접 삭제)
--
-- 주의:
--   - profiles.id 는 auth.users(id) ON DELETE CASCADE 이므로
--     profiles 삭제 시 auth.users 레코드는 남음 (orphaned auth user).
--     auth.users 삭제는 service_role API 필요 → 프론트에서 처리 불가.
--   - is_superadmin() 체크 미통과 시 EXCEPTION 발생 → 클라이언트 에러 반환.
--
-- 실행 방법:
--   supabase db query --linked --file supabase/delete_workspace.sql

-- ── RLS DELETE 정책 추가 (superadmin만 허용) ───────────────────────────────────
drop policy if exists "workspaces_delete" on workspaces;

create policy "workspaces_delete" on workspaces for delete using (
  is_superadmin()
);

-- ── delete_workspace RPC ───────────────────────────────────────────────────────
create or replace function delete_workspace(p_workspace_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- superadmin 권한 확인
  if not is_superadmin() then
    raise exception 'Forbidden: superadmin only';
  end if;

  -- 워크스페이스 삭제
  -- FK ON DELETE CASCADE 에 의해 아래 테이블도 자동 삭제됨:
  --   applications (workspace_id), customers (workspace_id), profiles (workspace_id)
  delete from workspaces
    where id = p_workspace_id;

  if not found then
    raise exception 'Workspace not found: %', p_workspace_id;
  end if;
end;
$$;

grant execute on function delete_workspace(uuid) to authenticated;
