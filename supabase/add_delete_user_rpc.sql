-- ============================================================
-- add_delete_user_rpc.sql
-- 목적: 프론트엔드에서 auth.users 삭제를 안전하게 호출하기 위한 RPC
-- 보안: superadmin 또는 admin(같은 워크스페이스)만 실행 가능
-- 실행: supabase db query --linked --file supabase/add_delete_user_rpc.sql
-- ============================================================

CREATE OR REPLACE FUNCTION delete_user(target_user_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_caller_role  text;
  v_caller_ws    uuid;
  v_target_ws    uuid;
  v_target_role  text;
BEGIN
  -- 호출자 역할 + workspace 파악
  SELECT role, workspace_id INTO v_caller_role, v_caller_ws
  FROM profiles WHERE id = auth.uid();

  IF v_caller_role IS NULL THEN
    RAISE EXCEPTION '인증이 필요합니다.';
  END IF;

  -- 본인 삭제 방지
  IF target_user_id = auth.uid() THEN
    RAISE EXCEPTION '본인 계정은 삭제할 수 없습니다.';
  END IF;

  -- superadmin: 전체 삭제 가능
  -- admin: 본인 워크스페이스의 consultant만 삭제 가능
  IF v_caller_role = 'superadmin' THEN
    -- 모든 유저 삭제 가능, 추가 검사 없음
    NULL;
  ELSIF v_caller_role = 'admin' THEN
    -- 타깃이 같은 워크스페이스인지 + consultant 역할인지 확인
    SELECT workspace_id, role INTO v_target_ws, v_target_role
    FROM profiles WHERE id = target_user_id;

    IF v_target_ws IS DISTINCT FROM v_caller_ws THEN
      RAISE EXCEPTION '같은 워크스페이스의 멤버만 삭제할 수 있습니다.';
    END IF;

    -- admin이 다른 admin/superadmin을 삭제하려는 경우 방지
    IF v_target_role IN ('admin', 'superadmin') THEN
      RAISE EXCEPTION '관리자는 컨설턴트만 삭제할 수 있습니다.';
    END IF;
  ELSE
    RAISE EXCEPTION '삭제 권한이 없습니다.';
  END IF;

  -- auth.users 삭제 (profiles는 ON DELETE CASCADE로 자동 삭제됨)
  DELETE FROM auth.users WHERE id = target_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION delete_user TO authenticated;
