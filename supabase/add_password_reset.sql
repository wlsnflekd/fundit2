-- add_password_reset.sql
-- 목적: 슈퍼관리자/관리자 전용 비밀번호 초기화 기능
--
-- 실행 방법 (택 1):
--   A) Supabase 대시보드 → SQL Editor → 이 파일 내용 전체 붙여넣기 → Run
--   B) CLI: supabase db query --linked --file supabase/add_password_reset.sql
--
-- 주의: BEGIN/COMMIT 없이 작성됨 — Dashboard SQL Editor 호환성 보장

-- ── 0. pgcrypto 확장 활성화 ──────────────────────────────────────────────────
-- 이미 활성화되어 있어도 오류 없이 통과 (IF NOT EXISTS)
create extension if not exists pgcrypto schema extensions;

-- ── 1. must_change_password 컬럼 추가 ──────────────────────────────────────
alter table public.profiles
  add column if not exists must_change_password boolean not null default false;

-- ── 2. reset_user_password RPC ─────────────────────────────────────────────
-- SECURITY DEFINER + postgres 소유 → auth.users 직접 수정 가능
-- search_path에 extensions 명시 → pgcrypto crypt()/gen_salt() 위치 보장

create or replace function public.reset_user_password(
  p_target_user_id uuid,
  p_new_password   text
)
returns void
language plpgsql
security definer
set search_path = public, extensions, auth
as $$
declare
  v_target_role      text;
  v_target_workspace uuid;
  v_caller_workspace uuid;
begin
  if p_target_user_id is null then
    raise exception 'target_user_id는 null일 수 없습니다.';
  end if;
  if p_new_password is null or length(trim(p_new_password)) < 6 then
    raise exception '비밀번호는 6자 이상이어야 합니다.';
  end if;

  select role, workspace_id
    into v_target_role, v_target_workspace
    from public.profiles
   where id = p_target_user_id;

  if v_target_role is null then
    raise exception '대상 사용자를 찾을 수 없습니다.';
  end if;

  if v_target_role = 'superadmin' then
    raise exception '슈퍼관리자 비밀번호는 초기화할 수 없습니다.';
  end if;

  if public.is_superadmin() then
    null;
  else
    select workspace_id into v_caller_workspace
      from public.profiles where id = auth.uid();

    if not (
      exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
      and v_target_workspace = v_caller_workspace
      and v_target_role = 'consultant'
    ) then
      raise exception 'Forbidden: 비밀번호 초기화 권한이 없습니다.';
    end if;
  end if;

  -- extensions.crypt / extensions.gen_salt: pgcrypto (bcrypt)
  update auth.users
     set encrypted_password = extensions.crypt(p_new_password, extensions.gen_salt('bf')),
         updated_at          = now()
   where id = p_target_user_id;

  if not found then
    raise exception '인증 사용자 레코드를 찾을 수 없습니다.';
  end if;

  update public.profiles
     set must_change_password = true
   where id = p_target_user_id;
end;
$$;

grant execute on function public.reset_user_password(uuid, text) to authenticated;

-- ── 배포 확인용 검증 쿼리 ────────────────────────────────────────────────────
-- 아래 결과가 나오면 정상 배포됨:
select
  proname as 함수명,
  prosecdef as security_definer
from pg_proc
where proname = 'reset_user_password'
  and pronamespace = (select oid from pg_namespace where nspname = 'public');
