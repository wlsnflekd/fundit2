-- fix_signup_function.sql
-- 문제: anon 역할에 workspaces INSERT GRANT 없음 → 가입 첫 단계에서 403
--       이메일 확인 활성화 시 auth.uid()=null → profiles_insert 정책 실패
-- 해결: security definer 함수로 workspace + profile을 원자적으로 생성
--       anon/authenticated 모두 이 함수만 호출하면 됨 (테이블 직접 INSERT 불필요)

-- ── 기존 함수 정리 ────────────────────────────────────────────────────────────
drop function if exists create_workspace_and_profile(text, uuid, text, text) cascade;

-- ── security definer 함수 생성 ────────────────────────────────────────────────
-- anon 상태에서도 호출 가능; DB 내부에서 superuser 권한으로 실행되어
-- RLS/GRANT 제한 없이 workspace, profile을 안전하게 생성함.
-- p_user_id: auth.signUp()이 반환한 user.id (이메일 미확인 상태여도 UUID는 발급됨)
create or replace function create_workspace_and_profile(
  p_workspace_name text,
  p_user_id        uuid,
  p_name           text,
  p_email          text
)
returns uuid
language plpgsql
security definer
set search_path = public   -- search_path 고정: 함수 하이재킹 방지
as $$
declare
  v_workspace_id uuid;
begin
  -- 입력 유효성 검사
  if p_workspace_name is null or trim(p_workspace_name) = '' then
    raise exception 'workspace_name은 비워둘 수 없습니다.';
  end if;
  if p_user_id is null then
    raise exception 'user_id는 null일 수 없습니다.';
  end if;
  if p_email is null or trim(p_email) = '' then
    raise exception 'email은 비워둘 수 없습니다.';
  end if;

  -- workspace 생성
  insert into workspaces (name)
  values (trim(p_workspace_name))
  returning id into v_workspace_id;

  -- profile 생성
  -- on conflict (id) do nothing: 이메일 확인 후 재호출 시 중복 삽입 방지
  insert into profiles (id, workspace_id, name, email, role, status)
  values (
    p_user_id,
    v_workspace_id,
    coalesce(nullif(trim(p_name), ''), p_email),
    trim(p_email),
    'admin',
    'active'
  )
  on conflict (id) do nothing;

  return v_workspace_id;
end;
$$;

-- ── 실행 권한 부여 ────────────────────────────────────────────────────────────
-- anon: 가입 흐름 첫 단계에서 호출
-- authenticated: 이메일 확인 후 재시도 또는 향후 온보딩 플로우 지원
grant execute on function create_workspace_and_profile(text, uuid, text, text)
  to anon, authenticated;

-- ── 검증 쿼리 ─────────────────────────────────────────────────────────────────
select
  routine_name,
  routine_type,
  security_type,
  data_type as return_type
from information_schema.routines
where routine_schema = 'public'
  and routine_name   = 'create_workspace_and_profile';
