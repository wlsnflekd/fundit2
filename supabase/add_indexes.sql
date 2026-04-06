-- FUNDIT 성능 인덱스
-- 실행: supabase db query --linked --file supabase/add_indexes.sql
-- 모두 IF NOT EXISTS 사용 — 중복 실행 안전

-- ── customers ──────────────────────────────────────────────────────────────
-- RLS 필터 (workspace_id = get_my_workspace_id())
CREATE INDEX IF NOT EXISTS idx_customers_workspace_id
  ON public.customers(workspace_id);

-- 담당자별 고객사 목록 (Customers 페이지 consultantFilter)
CREATE INDEX IF NOT EXISTS idx_customers_consultant
  ON public.customers(consultant);

-- 상태 필터
CREATE INDEX IF NOT EXISTS idx_customers_status
  ON public.customers(status);

-- ── applications ───────────────────────────────────────────────────────────
-- RLS 필터
CREATE INDEX IF NOT EXISTS idx_applications_workspace_id
  ON public.applications(workspace_id);

-- 상태 필터 (진행중, 승인완료 등)
CREATE INDEX IF NOT EXISTS idx_applications_status
  ON public.applications(status);

-- 담당자별 신청건 목록
CREATE INDEX IF NOT EXISTS idx_applications_consultant
  ON public.applications(consultant);

-- 고객사별 신청건 (고객사 상세 패널 관련 신청건)
CREATE INDEX IF NOT EXISTS idx_applications_customer_id
  ON public.applications(customer_id);

-- 마감일 정렬 (대시보드 마감 임박, D-day 정렬)
CREATE INDEX IF NOT EXISTS idx_applications_deadline
  ON public.applications(deadline);

-- ── notifications ──────────────────────────────────────────────────────────
-- 사용자 알림 조회 + 읽지 않은 카운트를 단일 복합 인덱스로 처리
-- (user_id 단독 조회와 user_id + is_read 조합 조회 모두 커버)
CREATE INDEX IF NOT EXISTS idx_notifications_user_id_is_read
  ON public.notifications(user_id, is_read);

-- ── schedules ──────────────────────────────────────────────────────────────
-- 날짜 정렬 + workspace 격리 복합 인덱스 (Calendar 페이지 주요 쿼리)
CREATE INDEX IF NOT EXISTS idx_schedules_workspace_date
  ON public.schedules(workspace_id, date);
