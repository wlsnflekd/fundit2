-- Realtime 활성화: customers, notifications 테이블
-- REPLICA IDENTITY FULL: UPDATE 이벤트에서 payload.new에 모든 컬럼 포함
-- (DEFAULT = 기본키만 포함 → UPDATE 핸들러에서 변경된 값 읽기 불가)

ALTER TABLE public.customers REPLICA IDENTITY FULL;
ALTER TABLE public.notifications REPLICA IDENTITY FULL;

-- supabase_realtime publication에 테이블 추가 (이미 포함된 경우 무시)
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.customers;
EXCEPTION WHEN duplicate_object THEN NULL;
END;
$$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
EXCEPTION WHEN duplicate_object THEN NULL;
END;
$$;
