-- ============================================================
-- fix_delete_user_rpc.sql
-- 목적: delete_user RPC 409 에러 해결
--
-- 원인 1: postgres 역할에 auth.users DELETE 권한 없음
-- 원인 2: customers.consultant, applications.consultant FK가
--          ON DELETE SET NULL 미적용 상태 (NO ACTION) 로
--          profiles 삭제 시 FK 위반 발생
--
-- 실행: Supabase Dashboard > SQL Editor에서 전체 붙여넣기 후 실행
--       (auth 스키마 접근은 Dashboard SQL Editor에서만 가능)
-- ============================================================

-- ── 1. postgres 역할에 auth 스키마 접근 권한 부여 ──────────────────────────────
-- SECURITY DEFINER 함수는 함수 소유자(postgres) 권한으로 실행됨
-- auth.users에 대한 SELECT/DELETE 권한이 없으면 409/403 에러 발생

GRANT USAGE ON SCHEMA auth TO postgres;
GRANT SELECT, DELETE ON auth.users TO postgres;

-- ── 2. customers.consultant FK → ON DELETE SET NULL ────────────────────────────
DO $$
DECLARE
  v_constraint_name text;
BEGIN
  SELECT tc.constraint_name
    INTO v_constraint_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
     AND tc.table_schema = kcu.table_schema
   WHERE tc.constraint_type = 'FOREIGN KEY'
     AND tc.table_schema = 'public'
     AND tc.table_name = 'customers'
     AND kcu.column_name = 'consultant';

  IF v_constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.customers DROP CONSTRAINT %I', v_constraint_name);
    RAISE NOTICE '[OK] customers.consultant FK 제거: %', v_constraint_name;
  ELSE
    RAISE NOTICE '[SKIP] customers.consultant FK 없음';
  END IF;
END;
$$;

ALTER TABLE public.customers
  ADD CONSTRAINT customers_consultant_fkey
  FOREIGN KEY (consultant)
  REFERENCES public.profiles(id)
  ON DELETE SET NULL;

-- ── 3. applications.consultant FK → ON DELETE SET NULL ────────────────────────
DO $$
DECLARE
  v_constraint_name text;
BEGIN
  SELECT tc.constraint_name
    INTO v_constraint_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
     AND tc.table_schema = kcu.table_schema
   WHERE tc.constraint_type = 'FOREIGN KEY'
     AND tc.table_schema = 'public'
     AND tc.table_name = 'applications'
     AND kcu.column_name = 'consultant';

  IF v_constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.applications DROP CONSTRAINT %I', v_constraint_name);
    RAISE NOTICE '[OK] applications.consultant FK 제거: %', v_constraint_name;
  ELSE
    RAISE NOTICE '[SKIP] applications.consultant FK 없음';
  END IF;
END;
$$;

ALTER TABLE public.applications
  ADD CONSTRAINT applications_consultant_fkey
  FOREIGN KEY (consultant)
  REFERENCES public.profiles(id)
  ON DELETE SET NULL;

-- ── 4. delete_user 함수 재생성 ─────────────────────────────────────────────────
-- SET search_path에 auth 스키마 추가하여 auth.users 접근 명시
CREATE OR REPLACE FUNCTION public.delete_user(target_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller_role  text;
  v_caller_ws    uuid;
  v_target_ws    uuid;
  v_target_role  text;
BEGIN
  -- 호출자 역할 + workspace 확인
  SELECT role, workspace_id INTO v_caller_role, v_caller_ws
  FROM public.profiles WHERE id = auth.uid();

  IF v_caller_role IS NULL THEN
    RAISE EXCEPTION '인증이 필요합니다.';
  END IF;

  -- 본인 삭제 방지
  IF target_user_id = auth.uid() THEN
    RAISE EXCEPTION '본인 계정은 삭제할 수 없습니다.';
  END IF;

  IF v_caller_role = 'superadmin' THEN
    -- superadmin: 모든 유저 삭제 가능 (본인 제외)
    NULL;

  ELSIF v_caller_role = 'admin' THEN
    -- admin: 같은 워크스페이스의 consultant만 삭제 가능
    SELECT workspace_id, role INTO v_target_ws, v_target_role
    FROM public.profiles WHERE id = target_user_id;

    IF v_target_ws IS DISTINCT FROM v_caller_ws THEN
      RAISE EXCEPTION '같은 워크스페이스의 멤버만 삭제할 수 있습니다.';
    END IF;

    IF v_target_role IN ('admin', 'superadmin') THEN
      RAISE EXCEPTION '관리자는 컨설턴트만 삭제할 수 있습니다.';
    END IF;

  ELSE
    RAISE EXCEPTION '삭제 권한이 없습니다.';
  END IF;

  -- auth.users 삭제
  -- profiles는 ON DELETE CASCADE로 자동 삭제
  -- customers.consultant, applications.consultant은 ON DELETE SET NULL으로 null 처리
  DELETE FROM auth.users WHERE id = target_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_user(uuid) TO authenticated;

-- ── 완료 확인 메시지 ───────────────────────────────────────────────────────────
DO $$
BEGIN
  RAISE NOTICE '=== fix_delete_user_rpc.sql 적용 완료 ===';
  RAISE NOTICE '1. postgres → auth.users DELETE 권한 부여됨';
  RAISE NOTICE '2. customers.consultant FK → ON DELETE SET NULL';
  RAISE NOTICE '3. applications.consultant FK → ON DELETE SET NULL';
  RAISE NOTICE '4. delete_user 함수 재생성됨';
END;
$$;
