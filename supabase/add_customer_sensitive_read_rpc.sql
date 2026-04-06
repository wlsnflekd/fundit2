-- 민감 컬럼 전용 SELECT RPC
-- 역할 체크(admin/superadmin: 워크스페이스 전체 / staff: 본인 담당 고객만)를 DB 레벨에서 강제
-- 실행: supabase db query --linked --file supabase/add_customer_sensitive_read_rpc.sql
--
-- 이 함수는 getCustomerSensitive() (supabase.js) 에서 직접 SELECT 하던 방식을
-- RPC 호출로 대체할 때 사용합니다.
-- 현재(2026-04-05) 기준으로 getCustomerSensitive는 RLS(workspace 격리)만 보장하고
-- 역할 기반 행 제한이 없으므로, 이 RPC로 전환 시 DB 레벨 이중 보호가 완성됩니다.

CREATE OR REPLACE FUNCTION get_customer_sensitive(p_customer_id uuid)
RETURNS TABLE(
  id               uuid,
  resident_id_front text,
  aippin_id        text,
  aippin_pw        text,
  aippin_2fa       text,
  sbiz_id          text,
  sbiz_pw          text
)
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public
AS $$
DECLARE
  v_role         text;
  v_consultant   uuid;
  v_workspace_id uuid;
BEGIN
  -- 인증 확인
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION '인증이 필요합니다.';
  END IF;

  -- 현재 사용자 역할 조회
  SELECT role INTO v_role
  FROM profiles
  WHERE id = auth.uid();

  IF v_role IS NULL THEN
    RAISE EXCEPTION '프로필을 찾을 수 없습니다.';
  END IF;

  -- admin/superadmin: 워크스페이스 내 모든 고객 열람 가능
  -- staff: 본인이 담당으로 지정된 고객만 열람 가능
  IF v_role NOT IN ('admin', 'superadmin') THEN
    SELECT consultant INTO v_consultant
    FROM customers
    WHERE id = p_customer_id
      AND workspace_id = get_my_workspace_id();

    IF NOT FOUND THEN
      RAISE EXCEPTION '고객사를 찾을 수 없거나 접근 권한이 없습니다.';
    END IF;

    IF v_consultant IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION '권한 없음: 담당 고객사의 인증정보만 열람할 수 있습니다.';
    END IF;
  END IF;

  -- 테넌트 격리 + 민감 컬럼 반환
  RETURN QUERY
    SELECT
      c.id,
      c.resident_id_front,
      c.aippin_id,
      c.aippin_pw,
      c.aippin_2fa,
      c.sbiz_id,
      c.sbiz_pw
    FROM customers c
    WHERE c.id = p_customer_id
      AND c.workspace_id = get_my_workspace_id();
END;
$$;

GRANT EXECUTE ON FUNCTION get_customer_sensitive TO authenticated;
