-- funds 테이블에 description 컬럼 추가
ALTER TABLE public.funds ADD COLUMN IF NOT EXISTS description text;

-- RLS: funds는 전체 공개 (SELECT는 누구나, INSERT는 authenticated)
ALTER TABLE public.funds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "funds_select" ON public.funds;
CREATE POLICY "funds_select" ON public.funds FOR SELECT USING (true);

DROP POLICY IF EXISTS "funds_insert" ON public.funds;
CREATE POLICY "funds_insert" ON public.funds FOR INSERT WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "funds_update" ON public.funds;
CREATE POLICY "funds_update" ON public.funds FOR UPDATE USING (auth.role() = 'authenticated');

GRANT SELECT, INSERT, UPDATE ON public.funds TO authenticated;
