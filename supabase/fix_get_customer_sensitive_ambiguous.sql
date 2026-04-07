-- fix_get_customer_sensitive_ambiguous.sql
-- 원인: get_customer_sensitive 함수가 RETURNS TABLE(id uuid, ...) 을 선언하면
--       PostgreSQL이 함수 바디 안의 비정규 'id' 참조를 출력 컬럼 변수와 혼동하여
--       "column reference 'id' is ambiguous" 에러 발생.
--
-- 수정: 함수 내 모든 서브쿼리에 테이블 alias 추가 → 컬럼 참조 명확화
--       profiles  → p.*
--       customers → c.*  (RETURN QUERY 쪽은 이미 c.alias 적용되어 있었음)
--
-- 실행: supabase db query --linked --file supabase/fix_get_customer_sensitive_ambiguous.sql

create or replace function get_customer_sensitive(p_customer_id uuid)
returns table(
  id                uuid,
  resident_id_front text,
  aippin_id         text,
  aippin_pw         text,
  aippin_2fa        text,
  sbiz_id           text,
  sbiz_pw           text
)
language plpgsql security invoker set search_path = public
as $$
declare
  v_role       text;
  v_consultant uuid;
begin
  -- 인증 확인
  if auth.uid() is null then
    raise exception '인증이 필요합니다.';
  end if;

  -- 역할 조회 — profiles alias 'p' 로 id 참조 명확화
  select p.role into v_role
  from profiles p
  where p.id = auth.uid();

  if v_role is null then
    raise exception '프로필을 찾을 수 없습니다.';
  end if;

  -- admin/superadmin: 워크스페이스 내 모든 고객 열람 가능
  -- consultant(staff): 본인이 담당으로 지정된 고객만 열람 가능
  if v_role not in ('admin', 'superadmin') then
    -- customers alias 'cu' 로 id / workspace_id 참조 명확화
    select cu.consultant into v_consultant
    from customers cu
    where cu.id = p_customer_id
      and cu.workspace_id = get_my_workspace_id();

    if not found then
      raise exception '고객사를 찾을 수 없거나 접근 권한이 없습니다.';
    end if;

    if v_consultant is distinct from auth.uid() then
      raise exception '권한 없음: 담당 고객사의 인증정보만 열람할 수 있습니다.';
    end if;
  end if;

  -- 테넌트 격리 + 민감 컬럼 반환 — alias 'c' 유지
  return query
    select
      c.id,
      c.resident_id_front,
      c.aippin_id,
      c.aippin_pw,
      c.aippin_2fa,
      c.sbiz_id,
      c.sbiz_pw
    from customers c
    where c.id = p_customer_id
      and c.workspace_id = get_my_workspace_id();
end;
$$;

grant execute on function get_customer_sensitive to authenticated;
