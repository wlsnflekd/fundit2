-- ============================================================
-- fix_user_delete_cascade.sql
-- 목적: auth.users(또는 profiles) 삭제 시 연관 데이터를 안전하게 정리
--       Supabase 대시보드에서 유저 삭제 시 FK 제약 위반 에러 해결
--
-- 실행: supabase db query --linked --file supabase/fix_user_delete_cascade.sql
--
-- 전제: 0001_setup.sql, add_notifications.sql, add_schedules.sql 실행 완료
-- ============================================================

-- ── 현재 FK 상태 분석 요약 ─────────────────────────────────────────────────────
-- [이미 올바름] profiles.id → auth.users(id) ON DELETE CASCADE
--   (0001_setup.sql에 정의됨, 유저 삭제 → profile 자동 삭제)
--
-- [이미 올바름] notifications.user_id → profiles(id) ON DELETE CASCADE
--   (add_notifications.sql에 정의됨, profile 삭제 → 알림 자동 삭제)
--
-- [이미 올바름] schedules.created_by → profiles(id) ON DELETE SET NULL
--   (add_schedules.sql에 정의됨, profile 삭제 → 일정 생성자 null 처리)
--
-- [문제] customers.consultant → profiles(id) ON DELETE 절 없음 (기본: NO ACTION)
--   → 컨설턴트(profile)를 삭제하려 하면 FK 위반으로 에러 발생
--   → 수정: ON DELETE SET NULL (고객사 데이터 유지, 담당자만 null로)
--
-- [문제] applications.consultant → profiles(id) ON DELETE 절 없음 (기본: NO ACTION)
--   → 컨설턴트(profile)를 삭제하려 하면 FK 위반으로 에러 발생
--   → 수정: ON DELETE SET NULL (신청건 데이터 유지, 담당자만 null로)
-- ──────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── 1. customers.consultant → profiles(id) ────────────────────────────────────
-- 적용 규칙: ON DELETE SET NULL
-- 이유: 컨설턴트가 퇴사/삭제되어도 고객사 이력 데이터는 보존해야 함.
--       담당자 컬럼만 null로 처리하고 배정되지 않은 상태로 남김.
--
-- 기존 constraint 이름을 모를 수 있으므로 information_schema 기반으로
-- 동적 DROP 후 재생성하는 안전한 패턴 사용.

DO $$
DECLARE
  v_constraint_name text;
BEGIN
  -- customers.consultant 컬럼의 FK constraint 이름 조회
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
    RAISE NOTICE '[customers.consultant] 기존 FK 제약 제거됨: %', v_constraint_name;
  ELSE
    RAISE NOTICE '[customers.consultant] 기존 FK 제약 없음 — ADD CONSTRAINT만 실행';
  END IF;
END;
$$;

ALTER TABLE public.customers
  ADD CONSTRAINT customers_consultant_fkey
  FOREIGN KEY (consultant)
  REFERENCES public.profiles(id)
  ON DELETE SET NULL;

-- ── 2. applications.consultant → profiles(id) ────────────────────────────────
-- 적용 규칙: ON DELETE SET NULL
-- 이유: 컨설턴트가 삭제되어도 신청건 이력은 회계/보고 목적으로 반드시 보존.
--       담당자 컬럼만 null로 처리하고 미배정 상태로 남김.

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
    RAISE NOTICE '[applications.consultant] 기존 FK 제약 제거됨: %', v_constraint_name;
  ELSE
    RAISE NOTICE '[applications.consultant] 기존 FK 제약 없음 — ADD CONSTRAINT만 실행';
  END IF;
END;
$$;

ALTER TABLE public.applications
  ADD CONSTRAINT applications_consultant_fkey
  FOREIGN KEY (consultant)
  REFERENCES public.profiles(id)
  ON DELETE SET NULL;

COMMIT;

-- ── 검증 쿼리 ─────────────────────────────────────────────────────────────────
-- 실행 후 아래 쿼리로 모든 FK ON DELETE 규칙이 올바른지 확인:
--
-- SELECT
--   tc.table_name,
--   kcu.column_name,
--   ccu.table_name  AS foreign_table,
--   ccu.column_name AS foreign_column,
--   rc.delete_rule
-- FROM information_schema.table_constraints tc
-- JOIN information_schema.key_column_usage kcu
--   ON tc.constraint_name = kcu.constraint_name
--  AND tc.table_schema = kcu.table_schema
-- JOIN information_schema.referential_constraints rc
--   ON tc.constraint_name = rc.constraint_name
--  AND tc.table_schema = rc.constraint_schema
-- JOIN information_schema.key_column_usage ccu
--   ON rc.unique_constraint_name = ccu.constraint_name
--  AND rc.unique_constraint_schema = ccu.constraint_schema
-- WHERE tc.constraint_type = 'FOREIGN KEY'
--   AND tc.table_schema = 'public'
--   AND (
--     ccu.table_name = 'profiles'
--     OR ccu.table_name = 'auth.users'
--   )
-- ORDER BY tc.table_name, kcu.column_name;
--
-- 기대 결과:
--   customers    | consultant  | profiles | id | SET NULL
--   applications | consultant  | profiles | id | SET NULL
--   notifications| user_id     | profiles | id | CASCADE
--   profiles     | id          | users    | id | CASCADE  (auth 스키마)
--   schedules    | created_by  | profiles | id | SET NULL
-- ──────────────────────────────────────────────────────────────────────────────

-- ── 보안 검토 메모 ────────────────────────────────────────────────────────────
-- [확인됨] workspace는 이 마이그레이션에서 건드리지 않음.
--   유저(profile) 삭제 시 workspace는 삭제되지 않음.
--   workspace에 다른 멤버가 있을 수 있으므로 workspace 삭제는
--   delete_workspace.sql의 별도 프로세스에서만 처리해야 함.
--
-- [확인됨] profiles → auth.users CASCADE는 0001_setup.sql에 이미 존재.
--   Supabase 대시보드에서 유저 삭제 시:
--   auth.users 삭제 → profiles CASCADE 삭제 → 이 마이그레이션 적용 후:
--     customers.consultant SET NULL
--     applications.consultant SET NULL
--     notifications CASCADE 삭제 (이미 적용됨)
--     schedules.created_by SET NULL (이미 적용됨)
--
-- [확인됨] customers 및 applications 레코드 자체는 workspace_id 기준으로
--   workspaces에 종속되므로, workspace가 살아있는 한 데이터는 보존됨.
-- ──────────────────────────────────────────────────────────────────────────────
