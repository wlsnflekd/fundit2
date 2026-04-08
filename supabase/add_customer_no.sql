-- ============================================================
-- customer_no 컬럼 추가 + 자동 부여 트리거
-- 2026-04-08
-- ============================================================

-- 작업 1: 컬럼 추가
ALTER TABLE customers ADD COLUMN IF NOT EXISTS customer_no integer;

-- 작업 2-A: 트리거 함수 생성
CREATE OR REPLACE FUNCTION public.set_customer_no()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.customer_no IS NULL THEN
    SELECT COALESCE(MAX(customer_no), 0) + 1
      INTO NEW.customer_no
      FROM customers;
  END IF;
  RETURN NEW;
END;
$$;

-- 작업 2-B: 기존 트리거 제거 후 재생성
DROP TRIGGER IF EXISTS trg_set_customer_no ON customers;

CREATE TRIGGER trg_set_customer_no
  BEFORE INSERT ON customers
  FOR EACH ROW
  EXECUTE FUNCTION set_customer_no();

-- 작업 3: 검증
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'customers' AND column_name = 'customer_no';

SELECT trigger_name, event_manipulation, action_timing
FROM information_schema.triggers
WHERE trigger_name = 'trg_set_customer_no';
