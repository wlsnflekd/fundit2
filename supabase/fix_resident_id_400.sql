-- =============================================================================
-- fix_resident_id_400.sql
-- 목적: 주민등록번호 뒷자리 저장 시 발생하는 400 에러 일괄 수정
--
-- 원인 1: add_customer_detail_fields.sql 미실행
--   → customers 테이블에 resident_id_front 컬럼이 없어
--     RPC 런타임에서 "column does not exist" 오류 발생
--
-- 원인 2: fix_customer_sensitive_rpc.sql 미실행
--   → update_customer_sensitive가 admin/superadmin만 허용
--     consultant 역할 사용자가 담당 고객 저장 시 "권한 없음" 예외 발생
--
-- 이 파일은 멱등(idempotent)하게 설계되어 이미 실행된 환경에서도 안전하게 재실행 가능
-- 실행: supabase db query --linked --file supabase/fix_resident_id_400.sql
-- =============================================================================

begin;

-- =============================================================================
-- PART 1: customers 테이블 컬럼 추가 (add_customer_detail_fields.sql 내용)
-- =============================================================================

alter table customers
  -- 고객사 기본 정보 확장
  add column if not exists status            text,
  add column if not exists lead_source       text,
  add column if not exists phone             text,
  add column if not exists business_type     text,
  add column if not exists region            text,
  add column if not exists business_age      int,
  add column if not exists received_date     date,
  add column if not exists received_month    text,
  -- 주민등록번호 (이 컬럼 누락이 400 에러의 직접 원인)
  add column if not exists resident_id_front text,
  add column if not exists birth_date        date,
  add column if not exists business_reg_date date,
  -- 계약/수수료 정보
  add column if not exists contract_amount   numeric,
  add column if not exists commission_rate   numeric,
  add column if not exists consultation_memo text,
  -- 재무 정보
  add column if not exists monthly_revenue   numeric,
  add column if not exists prev_year_revenue numeric,
  add column if not exists prev2_year_revenue numeric,
  add column if not exists existing_loan     numeric,
  add column if not exists required_funds    numeric,
  -- 신용/리스크 정보
  add column if not exists credit_score      int,
  add column if not exists tax_delinquent    boolean default false,
  add column if not exists overdue_history   boolean default false,
  add column if not exists rehabilitation    boolean default false,
  add column if not exists is_exporter       boolean default false,
  add column if not exists smart_device      boolean,
  add column if not exists closure_history   boolean,
  add column if not exists employee_count    int,
  add column if not exists policy_fund_usage boolean,
  -- 민감 인증정보 컬럼 (RPC를 통해서만 접근)
  add column if not exists aippin_id         text,
  add column if not exists aippin_pw         text,
  add column if not exists aippin_2fa        text,
  add column if not exists sbiz_id           text,
  add column if not exists sbiz_pw           text;

-- 민감 컬럼 코멘트 — 열람/수정은 아래 RPC를 통해서만 가능
comment on column customers.resident_id_front is '주민등록번호 — RPC get/update_customer_sensitive 통해서만 접근';
comment on column customers.aippin_id         is '아이핀 ID — RPC get/update_customer_sensitive 통해서만 접근';
comment on column customers.aippin_pw         is '아이핀 PW — RPC get/update_customer_sensitive 통해서만 접근';
comment on column customers.aippin_2fa        is '아이핀 2차인증 — RPC get/update_customer_sensitive 통해서만 접근';
comment on column customers.sbiz_id           is '소진공 ID — RPC get/update_customer_sensitive 통해서만 접근';
comment on column customers.sbiz_pw           is '소진공 PW — RPC get/update_customer_sensitive 통해서만 접근';

-- =============================================================================
-- PART 2: update_customer_sensitive RPC 재생성
--   (fix_customer_sensitive_rpc.sql 내용 — consultant도 담당 고객 수정 가능)
-- =============================================================================

create or replace function update_customer_sensitive(
  p_customer_id    uuid,
  p_aippin_id      text default null,
  p_aippin_pw      text default null,
  p_aippin_2fa     text default null,
  p_sbiz_id        text default null,
  p_sbiz_pw        text default null,
  p_resident_id    text default null
)
returns void
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

  -- 현재 사용자 역할 조회
  select role into v_role from profiles where id = auth.uid();

  if v_role is null then
    raise exception '프로필을 찾을 수 없습니다.';
  end if;

  -- admin/superadmin: 워크스페이스 내 모든 고객 수정 가능
  -- consultant(staff): 본인이 담당으로 지정된 고객만 수정 가능
  if v_role not in ('admin', 'superadmin') then
    select consultant into v_consultant
    from customers
    where id = p_customer_id
      and workspace_id = get_my_workspace_id();

    if not found then
      raise exception '고객사를 찾을 수 없거나 접근 권한이 없습니다.';
    end if;

    if v_consultant is distinct from auth.uid() then
      raise exception '권한 없음: 담당 고객사의 인증정보만 수정할 수 있습니다.';
    end if;
  end if;

  -- 테넌트 격리 + 민감 컬럼 업데이트
  -- null 전달 시 기존 값 유지 (COALESCE 패턴)
  update customers
  set
    aippin_id         = coalesce(p_aippin_id,   aippin_id),
    aippin_pw         = coalesce(p_aippin_pw,   aippin_pw),
    aippin_2fa        = coalesce(p_aippin_2fa,  aippin_2fa),
    sbiz_id           = coalesce(p_sbiz_id,     sbiz_id),
    sbiz_pw           = coalesce(p_sbiz_pw,     sbiz_pw),
    resident_id_front = coalesce(p_resident_id, resident_id_front)
  where id = p_customer_id
    and workspace_id = get_my_workspace_id();

  if not found then
    raise exception '고객사를 찾을 수 없거나 접근 권한이 없습니다.';
  end if;
end;
$$;

grant execute on function update_customer_sensitive to authenticated;

-- =============================================================================
-- PART 3: get_customer_sensitive RPC 재생성
--   (add_customer_sensitive_read_rpc.sql 내용)
--   admin/superadmin: 워크스페이스 전체 조회
--   consultant(staff): 본인 담당 고객만 조회
-- =============================================================================

create or replace function get_customer_sensitive(p_customer_id uuid)
returns table(
  id               uuid,
  resident_id_front text,
  aippin_id        text,
  aippin_pw        text,
  aippin_2fa       text,
  sbiz_id          text,
  sbiz_pw          text
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

  -- 현재 사용자 역할 조회
  select role into v_role
  from profiles
  where id = auth.uid();

  if v_role is null then
    raise exception '프로필을 찾을 수 없습니다.';
  end if;

  -- admin/superadmin: 워크스페이스 내 모든 고객 열람 가능
  -- consultant(staff): 본인이 담당으로 지정된 고객만 열람 가능
  if v_role not in ('admin', 'superadmin') then
    select consultant into v_consultant
    from customers
    where id = p_customer_id
      and workspace_id = get_my_workspace_id();

    if not found then
      raise exception '고객사를 찾을 수 없거나 접근 권한이 없습니다.';
    end if;

    if v_consultant is distinct from auth.uid() then
      raise exception '권한 없음: 담당 고객사의 인증정보만 열람할 수 있습니다.';
    end if;
  end if;

  -- 테넌트 격리 + 민감 컬럼 반환
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

-- =============================================================================
-- PART 4: 민감 컬럼 값 초기화 방법 (명시적으로 null 세팅하려면)
-- =============================================================================
-- 현재 update_customer_sensitive는 COALESCE 패턴을 사용하므로
-- null을 전달하면 기존 값이 유지됩니다.
-- 명시적으로 null로 초기화해야 하는 요구사항이 생기면
-- p_clear_* boolean 파라미터 추가를 검토하세요.
-- (현재 프론트엔드 흐름상 null 초기화 시나리오 없음 — 향후 필요 시 별도 마이그레이션)

commit;
