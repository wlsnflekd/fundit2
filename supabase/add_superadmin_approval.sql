-- add_superadmin_approval.sql
-- 목적:
--   1. profiles.role CHECK 제약에 'superadmin' 추가
--   2. profiles.approval_status 컬럼 추가 (pending/approved/rejected)
--   3. 기존 계정 전체 approved로 migration
--   4. is_superadmin() SECURITY DEFINER helper 함수 생성
--   5. get_my_workspace_id() 유지 (superadmin도 자신의 workspace_id 반환; bypass는 RLS 레이어 처리)
--   6. 모든 테이블 RLS 정책에 superadmin bypass 조건 추가
--   7. wlsnflekd2@gmail.com 계정을 superadmin으로 설정
--
-- 실행 순서: fix_rls_recursion.sql 실행 완료 상태를 전제로 함
-- 실행 방법: Supabase Dashboard SQL Editor 또는
--            supabase db query --linked --file supabase/add_superadmin_approval.sql

begin;

-- ── 1. role CHECK 제약 업데이트 ────────────────────────────────────────────────
-- 기존 제약: ('admin', 'consultant')
-- 변경 후:  ('admin', 'consultant', 'superadmin')

alter table profiles drop constraint if exists profiles_role_check;

alter table profiles add constraint profiles_role_check
  check (role in ('admin', 'consultant', 'superadmin'));

-- ── 2. approval_status 컬럼 추가 ──────────────────────────────────────────────
-- pending:  가입 후 승인 대기 중
-- approved: 승인 완료 (정상 사용 가능)
-- rejected: 거절 (로그인은 되나 앱 진입 차단)
--
-- 기존 계정이 있는 경우 default 'pending'으로 추가된 후 아래 UPDATE로 approved 전환

alter table profiles
  add column if not exists approval_status text not null default 'pending'
  check (approval_status in ('pending', 'approved', 'rejected'));

-- ── 3. 기존 계정 전체 approved로 migration ────────────────────────────────────
-- 이 마이그레이션 실행 시점에 이미 존재하는 계정은 정상 운영 중이므로 approved 처리
-- 신규 가입 계정은 기본값 'pending'으로 생성됨

update profiles
  set approval_status = 'approved'
  where approval_status = 'pending';

-- ── 4. is_superadmin() helper 함수 ────────────────────────────────────────────
-- SECURITY DEFINER: profiles RLS를 거치지 않고 직접 조회 → 재귀 없음
-- STABLE: 동일 트랜잭션 내 반복 호출 시 캐시 → 성능 이점
-- SET search_path = public: 함수 하이재킹 방지

create or replace function is_superadmin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from profiles
    where id = auth.uid()
      and role = 'superadmin'
  );
$$;

grant execute on function is_superadmin() to authenticated;

-- ── 5. RLS 정책 수정 ──────────────────────────────────────────────────────────
-- 패턴: is_superadmin() OR <기존 workspace 격리 조건>
-- is_superadmin()이 true면 workspace 필터를 건너뜀 → 모든 테넌트 데이터 접근 가능
-- get_my_workspace_id()는 그대로 유지 (superadmin도 자신의 workspace_id 정상 반환)

-- ── 5-1. profiles ──────────────────────────────────────────────────────────────

drop policy if exists "profiles_select" on profiles;
drop policy if exists "profiles_insert" on profiles;
drop policy if exists "profiles_update" on profiles;

-- SELECT
-- superadmin: 전체 profiles 조회 가능
-- 일반 사용자: 자신 또는 동일 workspace 멤버만
create policy "profiles_select" on profiles for select using (
  is_superadmin()
  or id = auth.uid()
  or workspace_id = get_my_workspace_id()
);

-- INSERT
-- superadmin 역할로는 이 정책으로 INSERT 불가 (직접 DB 수정만 허용)
-- create_workspace_and_profile RPC(SECURITY DEFINER)는 RLS를 우회하므로 영향 없음
-- 일반 가입 경로: id = auth.uid() 조건으로 자신의 레코드만 삽입 가능
create policy "profiles_insert" on profiles for insert with check (
  id = auth.uid()
);

-- UPDATE
-- superadmin: 모든 workspace의 profiles 수정 가능 (승인/거절 처리 포함)
-- admin: 자신의 workspace 내 profiles만 수정 가능
create policy "profiles_update" on profiles for update using (
  is_superadmin()
  or workspace_id = get_my_workspace_id()
) with check (
  is_superadmin()
  or workspace_id = get_my_workspace_id()
);

-- ── 5-2. workspaces ────────────────────────────────────────────────────────────
-- 기존: 전체 허용(true) — superadmin 관점에서 이미 충분하나
-- UPDATE는 superadmin + workspace 소속 admin만 허용하도록 강화
-- (현재 workspaces UPDATE가 true로 열려 있어 보안상 취약하지만,
--  이 마이그레이션 범위에서는 superadmin 조건만 명시적으로 추가함)

drop policy if exists "workspaces_select" on workspaces;
drop policy if exists "workspaces_insert" on workspaces;
drop policy if exists "workspaces_update" on workspaces;

-- SELECT: 전체 허용 유지 (가입 흐름에서 anon도 필요)
create policy "workspaces_select" on workspaces for select using (true);

-- INSERT: 전체 허용 유지 (create_workspace_and_profile RPC가 SECURITY DEFINER로 처리)
create policy "workspaces_insert" on workspaces for insert with check (true);

-- UPDATE: superadmin은 모든 workspace, 일반 사용자는 자신의 workspace만
create policy "workspaces_update" on workspaces for update using (
  is_superadmin()
  or id = get_my_workspace_id()
) with check (
  is_superadmin()
  or id = get_my_workspace_id()
);

-- ── 5-3. customers ─────────────────────────────────────────────────────────────

drop policy if exists "customers_workspace" on customers;

create policy "customers_workspace" on customers for all using (
  is_superadmin()
  or workspace_id = get_my_workspace_id()
) with check (
  is_superadmin()
  or workspace_id = get_my_workspace_id()
);

-- ── 5-4. applications ─────────────────────────────────────────────────────────

drop policy if exists "applications_workspace" on applications;

create policy "applications_workspace" on applications for all using (
  is_superadmin()
  or workspace_id = get_my_workspace_id()
) with check (
  is_superadmin()
  or workspace_id = get_my_workspace_id()
);

-- ── 5-5. funds / notices ──────────────────────────────────────────────────────
-- funds INSERT/UPDATE/DELETE: 기존 service_role 전용 → superadmin도 허용
-- SELECT는 기존대로 전체 허용 유지

drop policy if exists "funds_select" on funds;
drop policy if exists "funds_insert" on funds;
drop policy if exists "funds_update" on funds;
drop policy if exists "funds_delete" on funds;

create policy "funds_select" on funds for select using (true);
create policy "funds_insert" on funds for insert with check (
  auth.role() = 'service_role'
  or is_superadmin()
);
create policy "funds_update" on funds for update using (
  auth.role() = 'service_role'
  or is_superadmin()
);
create policy "funds_delete" on funds for delete using (
  auth.role() = 'service_role'
  or is_superadmin()
);

drop policy if exists "notices_select" on notices;
drop policy if exists "notices_insert" on notices;
drop policy if exists "notices_update" on notices;
drop policy if exists "notices_delete" on notices;

create policy "notices_select" on notices for select using (true);
create policy "notices_insert" on notices for insert with check (
  auth.role() = 'service_role'
  or is_superadmin()
);
create policy "notices_update" on notices for update using (
  auth.role() = 'service_role'
  or is_superadmin()
);
create policy "notices_delete" on notices for delete using (
  auth.role() = 'service_role'
  or is_superadmin()
);

-- ── 6. wlsnflekd2@gmail.com 계정을 superadmin으로 설정 ────────────────────────
-- profiles.email 기준으로 role과 approval_status를 superadmin/approved로 변경
-- 해당 계정이 없으면 아무것도 변경되지 않음 (안전)

update profiles
  set role            = 'superadmin',
      approval_status = 'approved'
  where email = 'wlsnflekd2@gmail.com';

-- 변경 결과 확인 (실행 후 로그에서 확인)
do $$
declare
  v_count int;
begin
  select count(*) into v_count
    from profiles
    where email = 'wlsnflekd2@gmail.com'
      and role = 'superadmin';

  if v_count = 0 then
    raise warning '경고: wlsnflekd2@gmail.com 계정을 찾을 수 없습니다. 해당 계정으로 가입 후 이 UPDATE를 수동으로 재실행하세요.';
  else
    raise notice '완료: wlsnflekd2@gmail.com 계정이 superadmin으로 설정되었습니다.';
  end if;
end;
$$;

commit;

-- ── 롤백 가이드 ───────────────────────────────────────────────────────────────
-- 긴급 롤백이 필요한 경우 아래 구문을 별도 트랜잭션으로 실행:
--
-- begin;
-- alter table profiles drop constraint if exists profiles_role_check;
-- alter table profiles add constraint profiles_role_check
--   check (role in ('admin', 'consultant'));
-- alter table profiles drop column if exists approval_status;
-- drop function if exists is_superadmin();
-- -- RLS 정책은 fix_rls_recursion.sql을 재실행하여 복구
-- commit;
