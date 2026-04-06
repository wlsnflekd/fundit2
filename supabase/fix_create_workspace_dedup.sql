-- fix_create_workspace_dedup.sql
-- 목적: 동일 이름의 워크스페이스가 이미 존재하면 신규 생성 대신 합류
--
-- 문제: create_workspace_and_profile이 항상 새 workspace를 INSERT하여
--       같은 회사 이름으로 가입한 admin이 서로 다른 workspace에 배치됨.
--
-- 해결:
--   1. workspace 이름으로 기존 레코드를 먼저 조회 (ILIKE, 대소문자/공백 무시)
--   2. 있으면 → 해당 workspace_id 재사용 (신규 생성 생략)
--   3. 없으면 → 기존과 동일하게 신규 workspace 생성
--   profiles INSERT 로직은 변경 없음 (approval_status = 'pending' 유지)
--
-- 영향 범위:
--   - 신규 admin 가입 시 중복 workspace 생성 방지
--   - consultant 합류(join_workspace_as_consultant)는 별도 함수이므로 무관
--
-- 실행 방법:
--   supabase db query --linked --file supabase/fix_create_workspace_dedup.sql

create or replace function create_workspace_and_profile(
  p_workspace_name text,
  p_user_id        uuid,
  p_name           text,
  p_email          text,
  p_role           text default 'admin'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
begin
  -- ── 입력 유효성 검사 ──────────────────────────────────────────────────────────
  if p_workspace_name is null or trim(p_workspace_name) = '' then
    raise exception 'workspace_name은 비워둘 수 없습니다.';
  end if;
  if p_user_id is null then
    raise exception 'user_id는 null일 수 없습니다.';
  end if;
  if p_email is null or trim(p_email) = '' then
    raise exception 'email은 비워둘 수 없습니다.';
  end if;
  if p_role = 'superadmin' then
    raise exception 'superadmin 역할은 이 경로로 생성할 수 없습니다. DB 직접 수정이 필요합니다.';
  end if;
  if p_role not in ('admin', 'consultant') then
    raise exception 'role은 admin 또는 consultant만 허용됩니다. 입력값: %', p_role;
  end if;

  -- ── 동일 이름 workspace 존재 여부 확인 ───────────────────────────────────────
  -- ILIKE + trim: 대소문자·앞뒤 공백 차이 무시
  -- 동명 workspace가 여러 개일 경우 가장 오래된 것(created_at ASC)을 기준으로 선택
  select id into v_workspace_id
    from workspaces
   where name ilike trim(p_workspace_name)
   order by created_at asc
   limit 1;

  -- ── workspace가 없으면 신규 생성 ─────────────────────────────────────────────
  if v_workspace_id is null then
    insert into workspaces (name)
    values (trim(p_workspace_name))
    returning id into v_workspace_id;
  end if;

  -- ── profile 생성 ──────────────────────────────────────────────────────────────
  -- 같은 workspace에 이미 프로필이 있으면 ON CONFLICT (id) DO NOTHING으로 무시
  -- approval_status = 'pending': 슈퍼관리자 승인 대기
  insert into profiles (id, workspace_id, name, email, role, status, approval_status)
  values (
    p_user_id,
    v_workspace_id,
    coalesce(nullif(trim(p_name), ''), p_email),
    trim(p_email),
    p_role,
    'active',
    'pending'
  )
  on conflict (id) do nothing;

  return v_workspace_id;
end;
$$;

grant execute on function create_workspace_and_profile(text, uuid, text, text, text)
  to anon, authenticated;
