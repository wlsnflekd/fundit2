-- update_signup_function.sql
-- 목적: create_workspace_and_profile 함수에 p_role 파라미터 추가
--       기존 4-파라미터 시그니처 정리 후 5-파라미터 버전으로 교체

-- 기존 함수 정리 (파라미터 시그니처가 달라 DROP 필요)
DROP FUNCTION IF EXISTS create_workspace_and_profile(text, uuid, text, text) CASCADE;

-- p_role 파라미터 추가 버전 생성
CREATE OR REPLACE FUNCTION create_workspace_and_profile(
  p_workspace_name text,
  p_user_id        uuid,
  p_name           text,
  p_email          text,
  p_role           text DEFAULT 'admin'   -- 새 파라미터: 기본값 'admin'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public   -- search_path 고정: 함수 하이재킹 방지
AS $$
DECLARE
  v_workspace_id uuid;
BEGIN
  -- 입력 유효성 검사
  IF p_workspace_name IS NULL OR trim(p_workspace_name) = '' THEN
    RAISE EXCEPTION 'workspace_name은 비워둘 수 없습니다.';
  END IF;
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id는 null일 수 없습니다.';
  END IF;
  IF p_email IS NULL OR trim(p_email) = '' THEN
    RAISE EXCEPTION 'email은 비워둘 수 없습니다.';
  END IF;
  IF p_role NOT IN ('admin', 'consultant') THEN
    RAISE EXCEPTION 'role은 admin 또는 consultant만 허용됩니다.';
  END IF;

  -- workspace 생성
  INSERT INTO workspaces (name)
  VALUES (trim(p_workspace_name))
  RETURNING id INTO v_workspace_id;

  -- profile 생성
  -- ON CONFLICT (id) DO NOTHING: 이메일 확인 후 재호출 시 중복 삽입 방지
  INSERT INTO profiles (id, workspace_id, name, email, role, status)
  VALUES (
    p_user_id,
    v_workspace_id,
    COALESCE(NULLIF(trim(p_name), ''), p_email),
    trim(p_email),
    p_role,
    'active'
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN v_workspace_id;
END;
$$;

-- 실행 권한 부여
-- anon: 가입 흐름 첫 단계에서 호출
-- authenticated: 이메일 확인 후 재시도 또는 향후 온보딩 플로우 지원
GRANT EXECUTE ON FUNCTION create_workspace_and_profile(text, uuid, text, text, text)
  TO anon, authenticated;

-- 검증 쿼리
SELECT
  routine_name,
  routine_type,
  security_type,
  data_type AS return_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name   = 'create_workspace_and_profile';
