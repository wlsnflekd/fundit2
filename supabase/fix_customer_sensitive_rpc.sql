-- fix_customer_sensitive_rpc.sql
-- 목적: update_customer_sensitive의 권한 로직을 get_customer_sensitive와 일치시킴
--
-- 문제: update_customer_sensitive는 admin/superadmin만 허용하는데,
--       get_customer_sensitive는 담당 consultant도 조회 허용.
--       → consultant가 담당 고객 인증정보 저장 시 무조건 400 에러 발생.
--
-- 수정: admin/superadmin → 워크스페이스 전체 수정 가능
--       consultant        → 본인이 담당으로 지정된 고객만 수정 가능
--
-- 실행: supabase db query --linked --file supabase/fix_customer_sensitive_rpc.sql

CREATE OR REPLACE FUNCTION update_customer_sensitive(
  p_customer_id    uuid,
  p_aippin_id      text DEFAULT NULL,
  p_aippin_pw      text DEFAULT NULL,
  p_aippin_2fa     text DEFAULT NULL,
  p_sbiz_id        text DEFAULT NULL,
  p_sbiz_pw        text DEFAULT NULL,
  p_resident_id    text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public
AS $$
DECLARE
  v_role       text;
  v_consultant uuid;
BEGIN
  -- 인증 확인
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION '인증이 필요합니다.';
  END IF;

  -- 현재 사용자 역할 조회
  SELECT role INTO v_role FROM profiles WHERE id = auth.uid();

  IF v_role IS NULL THEN
    RAISE EXCEPTION '프로필을 찾을 수 없습니다.';
  END IF;

  -- admin/superadmin: 워크스페이스 내 모든 고객 수정 가능
  -- consultant: 본인이 담당으로 지정된 고객만 수정 가능
  IF v_role NOT IN ('admin', 'superadmin') THEN
    SELECT consultant INTO v_consultant
    FROM customers
    WHERE id = p_customer_id
      AND workspace_id = get_my_workspace_id();

    IF NOT FOUND THEN
      RAISE EXCEPTION '고객사를 찾을 수 없거나 접근 권한이 없습니다.';
    END IF;

    IF v_consultant IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION '권한 없음: 담당 고객사의 인증정보만 수정할 수 있습니다.';
    END IF;
  END IF;

  -- 테넌트 격리: 같은 workspace 고객사만 UPDATE
  UPDATE customers
  SET
    aippin_id         = COALESCE(p_aippin_id,   aippin_id),
    aippin_pw         = COALESCE(p_aippin_pw,   aippin_pw),
    aippin_2fa        = COALESCE(p_aippin_2fa,  aippin_2fa),
    sbiz_id           = COALESCE(p_sbiz_id,     sbiz_id),
    sbiz_pw           = COALESCE(p_sbiz_pw,     sbiz_pw),
    resident_id_front = COALESCE(p_resident_id, resident_id_front)
  WHERE id = p_customer_id
    AND workspace_id = get_my_workspace_id();

  IF NOT FOUND THEN
    RAISE EXCEPTION '고객사를 찾을 수 없거나 접근 권한이 없습니다.';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION update_customer_sensitive TO authenticated;
