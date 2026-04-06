-- 민감 컬럼 전용 UPDATE RPC
-- 역할 체크(admin/superadmin만)와 테넌트 격리를 DB 레벨에서 강제
-- 실행: supabase db query --linked --file supabase/add_customer_sensitive_rpc.sql

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
BEGIN
  -- 역할 체크: admin / superadmin만 실행 가능
  IF (SELECT role FROM profiles WHERE id = auth.uid()) NOT IN ('admin', 'superadmin') THEN
    RAISE EXCEPTION '권한 없음: 관리자만 인증정보를 수정할 수 있습니다.';
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
