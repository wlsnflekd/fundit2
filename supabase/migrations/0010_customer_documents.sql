-- ============================================================================
-- 0010_customer_documents.sql
-- 고객 상세 '서류정보' 탭 — 서류 체크리스트 (파일 첨부는 후속)
-- ============================================================================
-- 구조
--   customer_documents: 고객 × 서류종류 1행. 행이 없으면 화면에서 '미요청'으로 표시하고,
--   상태·수령일·메모를 처음 바꿀 때 upsert (customer_id, doc_type) 로 생성.
--   개인↔법인 형태가 바뀌어도 행은 지우지 않음 (화면에서만 해당 형태의 목록을 표시).
--
-- 무결성
--   - workspace_id 는 트리거가 항상 부모 고객의 workspace_id 로 채움 → 클라이언트가 보낸 값 무시,
--     고객과 다른 워크스페이스로 저장되는 것을 원천 차단
--   - updated_at / updated_by 도 트리거가 기록 (updated_by = auth.uid())
--   - 고객 삭제 시 CASCADE, 작성자 프로필 삭제 시 updated_by NULL
--
-- 파일 첨부(후속): 별도 테이블 customer_document_files(document_id → customer_documents.id) +
--   Storage 버킷으로 추가 예정. 이 테이블에는 파일 컬럼을 두지 않는다.
--
-- RLS: customers 와 같은 기준 (superadmin 또는 내 워크스페이스), 0006 처럼 (select …) 래핑
-- Realtime: 미등록 (필요 시 후속)
--
-- 실행: Supabase SQL Editor 에서 파일 전체를 한 번에 실행 (단일 트랜잭션, 신규 테이블이라 락 영향 없음)
-- 순서: 이 SQL 적용 → 프론트 배포
-- 롤백: 파일 하단 ROLLBACK 섹션
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '5s';

-- ── 1. 테이블 ────────────────────────────────────────────────────────────────
CREATE TABLE public.customer_documents (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid        NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  customer_id  uuid        NOT NULL REFERENCES public.customers(id)  ON DELETE CASCADE,
  doc_type     text        NOT NULL,
  status       text        NOT NULL DEFAULT '미요청',
  received_at  date,
  note         text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  updated_by   uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,

  CONSTRAINT customer_documents_customer_doc_key UNIQUE (customer_id, doc_type),
  -- 개인·법인 서류 목록의 합집합 — 프론트 DOC_TYPES 와 동일하게 유지
  CONSTRAINT customer_documents_doc_type_check CHECK (doc_type IN (
    '사업자등록증', '부가세과세표준증명원', '재무제표', '소득금액증명원', '임대차계약서',
    '법인등기부등본', '주주명부', '4대보험가입자명부', '대출금융거래확인서', '회사소개서', '특허 및 인증'
  )),
  CONSTRAINT customer_documents_status_check CHECK (status IN ('미요청', '요청함', '수령', '보완필요')),
  CONSTRAINT customer_documents_note_len CHECK (note IS NULL OR char_length(note) <= 500)
);

COMMENT ON TABLE public.customer_documents IS
  '고객별 제출 서류 체크리스트 (0010). 행 없음 = 미요청. 형태 변경 시에도 행 보존.';

-- RLS 조건 컬럼 (customer_id 는 UNIQUE 인덱스의 선두 컬럼이라 별도 인덱스 불필요)
CREATE INDEX customer_documents_workspace_idx ON public.customer_documents (workspace_id);
CREATE INDEX customer_documents_updated_by_idx ON public.customer_documents (updated_by);

-- ── 2. 트리거: workspace_id 를 부모 고객 기준으로 강제 + updated_at/by 기록 ───
-- SECURITY INVOKER: 고객 조회에 customers RLS 가 그대로 적용됨
--   → 내 워크스페이스가 아닌 고객 id 로는 행을 만들 수 없음 (customer not found 예외)
CREATE OR REPLACE FUNCTION public.customer_documents_before_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_ws uuid;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.customer_id IS DISTINCT FROM OLD.customer_id THEN
    RAISE EXCEPTION 'customer_documents.customer_id 는 변경할 수 없습니다.';
  END IF;

  SELECT workspace_id INTO v_ws FROM public.customers WHERE id = NEW.customer_id;
  IF v_ws IS NULL THEN
    RAISE EXCEPTION '고객을 찾을 수 없습니다: %', NEW.customer_id;
  END IF;

  NEW.workspace_id := v_ws;
  NEW.updated_at   := now();
  NEW.updated_by   := (select auth.uid());
  IF TG_OP = 'UPDATE' THEN
    NEW.created_at := OLD.created_at;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_customer_documents_before_write
  BEFORE INSERT OR UPDATE ON public.customer_documents
  FOR EACH ROW EXECUTE FUNCTION public.customer_documents_before_write();

-- ── 3. 권한 + RLS ────────────────────────────────────────────────────────────
-- Supabase 기본 권한은 authenticated 에 TRUNCATE(RLS 무시) 등까지 주므로 전부 회수 후 4종만 부여
-- (service_role 은 기본 권한 유지)
REVOKE ALL ON public.customer_documents FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_documents TO authenticated;
REVOKE ALL ON FUNCTION public.customer_documents_before_write() FROM PUBLIC, anon;

ALTER TABLE public.customer_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY customer_documents_workspace ON public.customer_documents
  FOR ALL TO authenticated
  USING      ((select public.is_superadmin()) OR workspace_id = (select public.get_my_workspace_id()))
  WITH CHECK ((select public.is_superadmin()) OR workspace_id = (select public.get_my_workspace_id()));

NOTIFY pgrst, 'reload schema';

COMMIT;


-- ============================================================================
-- 검증 (실행 후 별도 실행)
-- ============================================================================
-- select relrowsecurity from pg_class where oid = 'public.customer_documents'::regclass;  -- true
-- select policyname, qual, with_check from pg_policies where tablename = 'customer_documents';  -- 1행, (SELECT …) 래핑
-- select grantee, string_agg(privilege_type, ',') from information_schema.role_table_grants
--  where table_name = 'customer_documents' and grantee in ('anon','authenticated','service_role') group by 1;
--   -- authenticated: SELECT,INSERT,UPDATE,DELETE (4종만) / anon: 없음 / service_role: 기본 권한
-- select count(*) from public.customer_documents;  -- 0


-- ============================================================================
-- ROLLBACK (문제 발생 시) — 저장된 서류 기록도 함께 삭제됨
-- ============================================================================
-- BEGIN;
-- DROP TABLE IF EXISTS public.customer_documents;
-- DROP FUNCTION IF EXISTS public.customer_documents_before_write();
-- NOTIFY pgrst, 'reload schema';
-- COMMIT;
