-- update_create_workspace_function.sql
-- 목적: create_workspace_and_profile 함수에 approval_status 처리 추가
--
-- 변경 내용:
--   - 신규 admin 가입 시 approval_status = 'pending' (슈퍼관리자 승인 대기)
--   - superadmin 역할로는 이 함수를 통한 가입 불가 (직접 DB 수정만 허용)
--   - 기존 5-파라미터 시그니처 유지 (프론트엔드 호출부 변경 불필요)
--
-- 전제: add_superadmin_approval.sql 실행 완료
--       (profiles.approval_status 컬럼이 존재해야 함)
--
-- 실행 방법: Supabase Dashboard SQL Editor 또는
--            supabase db query --linked --file supabase/update_create_workspace_function.sql

-- ── 기존 함수 정리 ────────────────────────────────────────────────────────────
-- 파라미터 시그니처가 동일하므로 CREATE OR REPLACE로 덮어쓰기 가능
-- 단, 혹시 모를 구버전(4-파라미터) 잔존 함수도 함께 정리

drop function if exists create_workspace_and_profile(text, uuid, text, text) cascade;

-- ── approval_status 처리가 포함된 함수 생성 ────────────────────────────────────
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
set search_path = public   -- search_path 고정: 함수 하이재킹 방지
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

  -- superadmin은 이 함수로 가입 불가 (직접 DB 수정만 허용)
  -- 프론트엔드에서도 이 역할을 선택할 수 없어야 하지만, DB 레이어에서도 차단
  if p_role = 'superadmin' then
    raise exception 'superadmin 역할은 이 경로로 생성할 수 없습니다. DB 직접 수정이 필요합니다.';
  end if;

  -- admin, consultant만 허용
  if p_role not in ('admin', 'consultant') then
    raise exception 'role은 admin 또는 consultant만 허용됩니다. 입력값: %', p_role;
  end if;

  -- ── workspace 생성 ────────────────────────────────────────────────────────────
  insert into workspaces (name)
  values (trim(p_workspace_name))
  returning id into v_workspace_id;

  -- ── profile 생성 ──────────────────────────────────────────────────────────────
  -- approval_status:
  --   admin     → 'pending' (슈퍼관리자가 workspace 단위로 승인)
  --   consultant → 'pending' (admin이 팀원 초대 후 승인)
  --
  -- 현재 요구사항상 모든 신규 가입은 pending 상태로 시작.
  -- 승인 후 approved로 변경하는 것은 별도 RPC 또는 Dashboard에서 처리.
  --
  -- ON CONFLICT (id) DO NOTHING:
  --   이메일 확인 활성화 시 확인 완료 후 재호출해도 중복 삽입 방지
  insert into profiles (id, workspace_id, name, email, role, status, approval_status)
  values (
    p_user_id,
    v_workspace_id,
    coalesce(nullif(trim(p_name), ''), p_email),
    trim(p_email),
    p_role,
    'active',       -- auth 레벨 status: 로그인 가능 여부
    'pending'       -- approval_status: 앱 진입 허용 여부 (별도 승인 필요)
  )
  on conflict (id) do nothing;

  return v_workspace_id;
end;
$$;

-- ── 실행 권한 부여 ────────────────────────────────────────────────────────────
-- anon: 가입 흐름 첫 단계에서 이메일 미확인 상태로 호출
-- authenticated: 이메일 확인 후 재시도 또는 향후 온보딩 플로우 지원
grant execute on function create_workspace_and_profile(text, uuid, text, text, text)
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
