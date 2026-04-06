-- applications 테이블에 name 컬럼 추가 (fund join 전 임시 사업명 입력용)
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS name text;

-- RLS 확인 (이미 있으면 skip)
ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'applications'
      AND policyname = 'applications_workspace'
  ) THEN
    CREATE POLICY "applications_workspace" ON public.applications
      FOR ALL USING (workspace_id = public.get_my_workspace_id())
      WITH CHECK (workspace_id = public.get_my_workspace_id());
  END IF;
END
$$;

GRANT ALL ON public.applications TO authenticated;
