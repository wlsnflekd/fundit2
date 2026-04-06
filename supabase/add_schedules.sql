CREATE TABLE IF NOT EXISTS public.schedules (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  title        text NOT NULL,
  type         text NOT NULL DEFAULT '기타',  -- 마감/실사/협약/심사/제출/미팅/내부
  date         date NOT NULL,
  customer_id  uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  memo         text,
  created_by   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.schedules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "schedules_workspace" ON public.schedules;
CREATE POLICY "schedules_workspace" ON public.schedules
  FOR ALL USING (workspace_id = public.get_my_workspace_id())
  WITH CHECK (workspace_id = public.get_my_workspace_id());

GRANT ALL ON public.schedules TO authenticated;
