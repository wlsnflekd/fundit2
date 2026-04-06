-- add_join_workspace_function.sql
-- 목적: 기존 워크스페이스에 consultant로 합류하는 RPC 함수 추가
--       + 워크스페이스 이름 자동완성용 검색 함수 추가
--
-- 전제: add_superadmin_approval.sql 실행 완료
--       (profiles.approval_status, profiles.role CHECK('consultant') 존재해야 함)
--
-- 실행 방법:
--   supabase db query --linked --file supabase/add_join_workspace_function.sql
--
-- 설계 주의사항:
--   - profiles.email 컬럼에 UNIQUE 제약이 있어 동일 이메일로 여러 workspace에
--     프로필을 가질 수 없음. 현 스키마 제약이며 추후 멀티-workspace 지원 시
--     이 제약을 (email, workspace_id) 복합 유니크로 변경해야 함.
--   - join_workspace_as_consultant는 SECURITY DEFINER이므로 RLS를 우회함.
--     함수 내부에서 입력 유효성 검사를 직접 수행함.
--   - search_workspaces는 워크스페이스 이름을 anon에게 공개함.
--     이름만 노출되며 민감 정보(id 포함)가 없어 허용 가능한 수준으로 판단.
--     단, id도 반환하므로 프론트엔드에서 id를 UI에 직접 노출하지 말 것.

begin;

-- ── 1. join_workspace_as_consultant ─────────────────────────────────────────
-- 워크스페이스 이름으로 검색하여 해당 워크스페이스에 consultant로 합류.
-- approval_status = 'pending'으로 생성 → 워크스페이스 admin이 승인해야 앱 진입 가능.
--
-- 반환값 (jsonb):
--   성공: { "workspace_id": "...", "workspace_name": "..." }
--   에러: RAISE EXCEPTION으로 클라이언트에 전달 (Supabase RPC error.message)
--
-- 에러 케이스:
--   1. p_workspace_name이 빈 문자열
--   2. 해당 이름의 워크스페이스 없음
--   3. 이미 해당 workspace_id + user_id 조합으로 프로필 존재
--   4. 동일 이메일로 다른 workspace에 이미 프로필 존재 (email UNIQUE 제약)
--   5. user_id 또는 email이 null/빈 문자열

create or replace function join_workspace_as_consultant(
  p_workspace_name text,
  p_user_id        uuid,
  p_name           text,
  p_email          text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id   uuid;
  v_workspace_name text;
begin
  -- ── 입력 유효성 검사 ──────────────────────────────────────────────────────
  if p_workspace_name is null or trim(p_workspace_name) = '' then
    raise exception '워크스페이스 이름은 비워둘 수 없습니다.';
  end if;
  if p_user_id is null then
    raise exception 'user_id는 null일 수 없습니다.';
  end if;
  if p_email is null or trim(p_email) = '' then
    raise exception 'email은 비워둘 수 없습니다.';
  end if;

  -- ── 워크스페이스 검색 ─────────────────────────────────────────────────────
  -- 입력값과 정확히 일치하는 이름 검색 (ILIKE + trim으로 대소문자/공백 무시)
  -- 동일 이름 워크스페이스가 여러 개일 경우 created_at 가장 오래된 것을 선택
  select id, name
    into v_workspace_id, v_workspace_name
    from workspaces
   where name ilike trim(p_workspace_name)
   order by created_at asc
   limit 1;

  if v_workspace_id is null then
    raise exception '워크스페이스를 찾을 수 없습니다: %', trim(p_workspace_name);
  end if;

  -- ── 중복 가입 확인: 동일 workspace에 이미 프로필 존재 ─────────────────────
  if exists (
    select 1 from profiles
     where id = p_user_id
       and workspace_id = v_workspace_id
  ) then
    raise exception '이미 해당 워크스페이스에 가입되어 있습니다.';
  end if;

  -- ── 이메일 중복 확인: 다른 workspace에 동일 이메일 프로필 존재 ─────────────
  -- profiles.email 컬럼에 UNIQUE 제약이 있으므로 사전 체크 후 명확한 에러 메시지 제공.
  -- 이 체크 없이 INSERT하면 "duplicate key value violates unique constraint" 에러가
  -- 노출되어 사용자가 원인을 알 수 없음.
  if exists (
    select 1 from profiles
     where email = trim(p_email)
       and id   != p_user_id
  ) then
    raise exception '이미 다른 워크스페이스에 등록된 이메일입니다. 해당 계정으로 로그인하거나 다른 이메일을 사용하세요.';
  end if;

  -- ── 프로필 생성 ───────────────────────────────────────────────────────────
  -- role    = 'consultant': 워크스페이스 합류는 항상 consultant로 시작
  -- status  = 'active'    : auth 레벨 접근 허용 (로그인 가능)
  -- approval_status = 'pending': 워크스페이스 admin 승인 대기
  --
  -- ON CONFLICT (id) DO NOTHING:
  --   동일 user_id로 이미 다른 workspace 프로필이 있는 경우 (id PK 충돌)
  --   → 위의 중복 확인으로 같은 workspace 케이스는 이미 차단됨
  --   → 여기서 NOTHING 처리되는 케이스는 스키마 제약상 발생하지 않지만
  --     방어적으로 유지
  insert into profiles (id, workspace_id, name, email, role, status, approval_status)
  values (
    p_user_id,
    v_workspace_id,
    coalesce(nullif(trim(p_name), ''), trim(p_email)),
    trim(p_email),
    'consultant',
    'active',
    'pending'
  )
  on conflict (id) do nothing;

  return jsonb_build_object(
    'workspace_id',   v_workspace_id,
    'workspace_name', v_workspace_name
  );
end;
$$;

grant execute on function join_workspace_as_consultant(text, uuid, text, text)
  to anon, authenticated;

-- ── 2. search_workspaces ─────────────────────────────────────────────────────
-- 워크스페이스 이름 부분 일치 검색 (가입 흐름 자동완성용).
-- anon에게도 이름과 id를 공개하는 함수이므로:
--   - 이름, id 외 민감 정보(plan, created_at 등)는 반환하지 않음
--   - 결과 최대 10건으로 제한 (대량 스캔 방지)
--   - 빈 검색어 입력 시 빈 결과 반환 (전체 목록 노출 방지)
--
-- SECURITY DEFINER: workspaces 테이블 RLS를 우회하여 anon도 조회 가능.
-- STABLE: 동일 트랜잭션 내 동일 입력 결과 캐시 가능.

create or replace function search_workspaces(p_query text)
returns table(id uuid, name text)
language sql
security definer
stable
set search_path = public
as $$
  select w.id, w.name
    from workspaces w
   where trim(p_query) != ''
     and w.name ilike '%' || trim(p_query) || '%'
   order by w.name
   limit 10;
$$;

grant execute on function search_workspaces(text)
  to anon, authenticated;

commit;

-- ── 검증 쿼리 (실행 후 결과 확인용) ─────────────────────────────────────────
select
  routine_name,
  security_type,
  data_type as return_type
from information_schema.routines
where routine_schema = 'public'
  and routine_name in ('join_workspace_as_consultant', 'search_workspaces')
order by routine_name;
