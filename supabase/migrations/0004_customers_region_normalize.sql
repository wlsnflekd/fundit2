-- ============================================================
-- 0004_customers_region_normalize.sql
-- customers.region 값 정규화 (자유 텍스트 → 17개 시/도 표준값)
-- ============================================================
--
-- 배경:
--   customers.region 은 원래 자유 텍스트로 입력되어 왔습니다 (구글폼 →
--   Apps Script → submit_customer_form RPC 경로 포함). 그 결과 "경기도
--   남양주시", "충남 천안", "마포구", "김해", "Seoul", "서울시 강남구",
--   "전북특별자치도 완주군 용진읍 …" 같은 값과 "." "가나" "깅남" 같은
--   오타/쓰레기 값이 뒤섞여 있어 지역별 필터·통계에 쓸 수 없는 상태입니다.
--
-- 이번 변경:
--   1) customers.address (text) 신규 — 자유 텍스트 원문 보관 전용
--   2) customers.region  은 앞으로 17개 시/도 표준값만 저장 (필터/인덱스 기준)
--   3) public.sido_list()  — 17개 표준 시/도 값의 단일 소스 (SQL 함수)
--   4) public.parse_sido(text) — 자유 텍스트 → 표준 시/도 파싱 함수
--      (src/utils/region.js 의 parseSido() 와 완전히 동일한 규칙. 한쪽을
--       수정하면 반드시 다른 쪽도 함께 수정할 것)
--   5) 기존 2,765건 데이터 백필: region 이 표준값이 아니면 원문을 address 로
--      옮기고 region 을 파싱 결과로 교체 (파싱 실패 시 region=NULL, address
--      에는 원문이 남음)
--   6) trg_customers_normalize_region 트리거 — 이후 모든 INSERT/UPDATE
--      경로(앱, submit_customer_form RPC, Make, REST 등 무엇이든)에서
--      자동으로 동일 규칙 적용
--   7) idx_customers_workspace_region 인덱스 추가
--
-- 안전성:
--   - 모든 문장이 IF NOT EXISTS / CREATE OR REPLACE / DROP ... IF EXISTS 로
--     감싸여 있어 재실행해도 안전합니다 (idempotent). 백필 UPDATE 문도
--     재실행 시 대상 행이 0건이 되도록 WHERE 조건을 설계했습니다.
--   - RLS 정책은 전혀 건드리지 않습니다 (customers_workspace 정책 그대로).
--     트리거 함수는 NEW 레코드 값만 계산하며 customers 테이블을 직접
--     조회/수정하지 않으므로 SECURITY DEFINER 가 필요 없습니다
--     (invoker 권한으로 실행되어도 RLS 우회가 발생하지 않음).
--   - workspace_id, tenant 격리와는 무관한 순수 데이터 정제 작업입니다.
--
-- 실행 방법:
--   Supabase Dashboard > SQL Editor 에 붙여넣기 후 실행
--   또는: supabase db query --linked --file supabase/migrations/0004_customers_region_normalize.sql
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- 1) 컬럼 추가: address (자유 텍스트 원문 보관용)
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS address text;

-- 주의: COMMENT ON ... IS 는 단일 문자열 리터럴(Sconst)만 받습니다. || 연산자는
-- 쓸 수 없고, 아래처럼 공백/줄바꿈만 두고 문자열 리터럴을 나란히 쓰면 렉서가
-- 자동으로 이어붙입니다 (SQL 표준의 문자열 리터럴 연속 규칙).
COMMENT ON COLUMN public.customers.address IS
  '자유 텍스트 주소/지역 원문 (구글폼 제출값, 상담원 직접 입력 등). '
  '표준 시/도 값은 region 컬럼에 별도 저장되며, trg_customers_normalize_region '
  '트리거가 이 컬럼과 region 을 자동으로 동기화합니다.';

COMMENT ON COLUMN public.customers.region IS
  '17개 시/도 표준값만 저장 (필터·인덱스 기준). public.sido_list() 참고. '
  '자유 텍스트가 들어오면 트리거가 address 로 원문을 보존하고 이 컬럼은 '
  'public.parse_sido() 결과로 대체합니다.';


-- ────────────────────────────────────────────────────────────
-- 2) 17개 표준 시/도 값 — 단일 소스
--    (src/utils/region.js 의 SIDO_LIST 와 반드시 동일하게 유지)
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sido_list()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT ARRAY['서울','부산','대구','인천','광주','대전','울산','세종','경기','강원','충북','충남','전북','전남','경북','경남','제주'];
$$;

COMMENT ON FUNCTION public.sido_list() IS
  '17개 표준 시/도 값 목록. customers.region 이 가질 수 있는 유일한 값 집합.';


-- ────────────────────────────────────────────────────────────
-- 3) 자유 텍스트 → 표준 시/도 파싱 함수
--    src/utils/region.js parseSido() 와 동일한 규칙:
--      0) 정규화(공백 정리, 소문자화) 후 17개 표준값과 완전 일치하면 그대로 반환
--      1단계) 시/도 접두 표기 매칭 (긴 접두어 우선) — "서울특별시", "서울시",
--             "Seoul" 등 → 표준 시/도
--      2단계) 시/군/구·주요 지명 매칭 (긴 이름 우선) — "김해", "마포구" 등
--      그 외에는 NULL (미해석)
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.parse_sido(p_text text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v          text;
  v_result   text;
BEGIN
  IF p_text IS NULL THEN
    RETURN NULL;
  END IF;

  -- 공백 정리 + 소문자화 (한글은 대소문자가 없으므로 영문 별칭에만 영향)
  v := lower(regexp_replace(btrim(p_text), '\s+', ' ', 'g'));

  IF v = '' THEN
    RETURN NULL;
  END IF;

  -- 0단계: 이미 17개 표준값과 완전히 일치
  IF v = ANY (public.sido_list()) THEN
    RETURN v;
  END IF;

  -- 1단계: 시/도 접두 표기 매칭 (긴 접두어 우선 — 예: "충청북" 이 "충북" 보다 먼저)
  SELECT x.sido INTO v_result
  FROM (VALUES
    ('서울','서울'), ('seoul','서울'),
    ('부산','부산'), ('busan','부산'),
    ('대구','대구'), ('daegu','대구'),
    ('인천','인천'), ('incheon','인천'),
    ('광주','광주'), ('gwangju','광주'),
    ('대전','대전'), ('daejeon','대전'),
    ('울산','울산'), ('ulsan','울산'),
    ('세종','세종'), ('sejong','세종'),
    ('경기','경기'), ('gyeonggi','경기'),
    ('강원','강원'), ('gangwon','강원'),
    ('충청북','충북'), ('충북','충북'), ('chungbuk','충북'),
    ('충청남','충남'), ('충남','충남'), ('chungnam','충남'),
    ('전라북','전북'), ('전북','전북'), ('jeonbuk','전북'),
    ('전라남','전남'), ('전남','전남'), ('jeonnam','전남'),
    ('경상북','경북'), ('경북','경북'), ('gyeongbuk','경북'),
    ('경상남','경남'), ('경남','경남'), ('gyeongnam','경남'),
    ('제주','제주'), ('jeju','제주')
  ) AS x(prefix, sido)
  WHERE v LIKE x.prefix || '%'
  ORDER BY length(x.prefix) DESC
  LIMIT 1;

  IF v_result IS NOT NULL THEN
    RETURN v_result;
  END IF;

  -- 2단계: 시/군/구·주요 지명 매칭 (긴 이름 우선 — 예: "남양주" 가 "양주" 보다 먼저)
  -- 여러 시/도에 동일 이름이 있는 곳(중구·동구·서구·남구·북구·강서구·고성·서면 등)은
  -- src/utils/region.js 와 동일하게 의도적으로 제외.
  SELECT x.sido INTO v_result
  FROM (VALUES
    -- 서울 (구 + 자주 쓰는 지명)
    ('종로구','서울'), ('용산구','서울'), ('성동구','서울'), ('광진구','서울'),
    ('동대문구','서울'), ('중랑구','서울'), ('성북구','서울'), ('강북구','서울'),
    ('도봉구','서울'), ('노원구','서울'), ('은평구','서울'), ('서대문구','서울'),
    ('마포구','서울'), ('양천구','서울'), ('구로구','서울'), ('금천구','서울'),
    ('영등포구','서울'), ('동작구','서울'), ('관악구','서울'), ('서초구','서울'),
    ('강남구','서울'), ('송파구','서울'), ('강동구','서울'),
    ('마포','서울'), ('노원','서울'), ('성북','서울'), ('강남','서울'),
    ('서초','서울'), ('송파','서울'), ('강동','서울'), ('영등포','서울'),
    ('여의도','서울'), ('홍대','서울'), ('잠실','서울'), ('천호동','서울'),
    ('방이동','서울'), ('성수동','서울'), ('구로','서울'), ('목동','서울'),
    -- 부산
    ('해운대구','부산'), ('사하구','부산'), ('사상구','부산'), ('금정구','부산'),
    ('연제구','부산'), ('수영구','부산'), ('영도구','부산'), ('동래구','부산'),
    ('부산진구','부산'), ('기장군','부산'), ('해운대','부산'), ('기장','부산'),
    -- 대구
    ('달서구','대구'), ('수성구','대구'), ('달성군','대구'), ('군위군','대구'), ('군위','대구'),
    -- 인천
    ('계양구','인천'), ('부평구','인천'), ('미추홀구','인천'), ('연수구','인천'),
    ('남동구','인천'), ('강화군','인천'), ('옹진군','인천'), ('부평','인천'),
    ('송도','인천'), ('강화','인천'),
    -- 광주
    ('광산구','광주'),
    -- 대전
    ('유성구','대전'), ('대덕구','대전'), ('유성','대전'),
    -- 울산
    ('울주군','울산'), ('울주','울산'),
    -- 경기
    ('수원','경기'), ('성남','경기'), ('고양','경기'), ('용인','경기'),
    ('부천','경기'), ('안산','경기'), ('안양','경기'), ('남양주','경기'),
    ('화성','경기'), ('평택','경기'), ('의정부','경기'), ('시흥','경기'),
    ('파주','경기'), ('김포','경기'), ('광명','경기'), ('군포','경기'),
    ('하남','경기'), ('오산','경기'), ('이천','경기'), ('양주','경기'),
    ('구리','경기'), ('안성','경기'), ('포천','경기'), ('의왕','경기'),
    ('여주','경기'), ('동두천','경기'), ('과천','경기'), ('양평','경기'),
    ('가평','경기'), ('연천','경기'), ('분당','경기'), ('판교','경기'),
    ('일산','경기'), ('동탄','경기'), ('광교','경기'),
    -- 강원
    ('춘천','강원'), ('원주','강원'), ('강릉','강원'), ('동해','강원'),
    ('태백','강원'), ('속초','강원'), ('삼척','강원'), ('홍천','강원'),
    ('횡성','강원'), ('영월','강원'), ('평창','강원'), ('정선','강원'),
    ('철원','강원'), ('화천','강원'), ('양구','강원'), ('인제','강원'), ('양양','강원'),
    -- 충북
    ('청주','충북'), ('충주','충북'), ('제천','충북'), ('보은','충북'),
    ('옥천','충북'), ('영동','충북'), ('증평','충북'), ('진천','충북'),
    ('괴산','충북'), ('음성','충북'), ('단양','충북'),
    -- 충남
    ('천안','충남'), ('공주','충남'), ('보령','충남'), ('아산','충남'),
    ('서산','충남'), ('논산','충남'), ('계룡','충남'), ('당진','충남'),
    ('금산','충남'), ('부여','충남'), ('서천','충남'), ('청양','충남'),
    ('홍성','충남'), ('예산','충남'), ('태안','충남'),
    -- 전북
    ('전주','전북'), ('군산','전북'), ('익산','전북'), ('정읍','전북'),
    ('남원','전북'), ('김제','전북'), ('완주','전북'), ('진안','전북'),
    ('무주','전북'), ('장수','전북'), ('임실','전북'), ('순창','전북'),
    ('고창','전북'), ('부안','전북'),
    -- 전남
    ('목포','전남'), ('여수','전남'), ('순천','전남'), ('나주','전남'),
    ('광양','전남'), ('담양','전남'), ('곡성','전남'), ('구례','전남'),
    ('고흥','전남'), ('보성','전남'), ('화순','전남'), ('장흥','전남'),
    ('강진','전남'), ('해남','전남'), ('영암','전남'), ('무안','전남'),
    ('함평','전남'), ('영광','전남'), ('장성','전남'), ('완도','전남'),
    ('진도','전남'), ('신안','전남'),
    -- 경북
    ('포항','경북'), ('경주','경북'), ('김천','경북'), ('안동','경북'),
    ('구미','경북'), ('영주','경북'), ('영천','경북'), ('상주','경북'),
    ('문경','경북'), ('경산','경북'), ('의성','경북'), ('청송','경북'),
    ('영양','경북'), ('영덕','경북'), ('청도','경북'), ('고령','경북'),
    ('성주','경북'), ('칠곡','경북'), ('예천','경북'), ('봉화','경북'),
    ('울진','경북'), ('울릉','경북'),
    -- 경남
    ('창원','경남'), ('진주','경남'), ('통영','경남'), ('사천','경남'),
    ('김해','경남'), ('밀양','경남'), ('거제','경남'), ('양산','경남'),
    ('의령','경남'), ('함안','경남'), ('창녕','경남'), ('남해','경남'),
    ('하동','경남'), ('산청','경남'), ('함양','경남'), ('거창','경남'), ('합천','경남'),
    -- 제주
    ('서귀포','제주')
  ) AS x(city, sido)
  WHERE v LIKE x.city || '%'
  ORDER BY length(x.city) DESC
  LIMIT 1;

  RETURN v_result; -- NULL 이면 미해석 (원문은 address 에 보존됨)
END;
$$;

COMMENT ON FUNCTION public.parse_sido(text) IS
  '자유 텍스트 주소/지역 → 17개 표준 시/도 값 또는 NULL. '
  'src/utils/region.js 의 parseSido() 와 동일한 규칙 — 한쪽 수정 시 반드시 함께 수정할 것.';

GRANT EXECUTE ON FUNCTION public.parse_sido(text), public.sido_list() TO anon, authenticated;


-- ────────────────────────────────────────────────────────────
-- 4) 기존 데이터 백필 (트리거 생성 전에 실행 — 재실행 안전)
-- ────────────────────────────────────────────────────────────

-- 4-a) 공백 문자열 → NULL 정리
UPDATE public.customers
SET region = NULL
WHERE region IS NOT NULL AND btrim(region) = '';

-- 4-b) region 에 자유 텍스트가 들어있는 행: 원문을 address 로 보존하고
--      region 은 파싱 결과로 교체. (재실행 시 이미 표준값이거나 NULL인
--      행만 남아 WHERE 조건에 걸리지 않으므로 0건 처리됨 — idempotent)
UPDATE public.customers
SET
  address = CASE
              WHEN address IS NULL OR btrim(address) = '' THEN region
              ELSE address
            END,
  region  = public.parse_sido(region)
WHERE region IS NOT NULL
  AND NOT (region = ANY (public.sido_list()));


-- ────────────────────────────────────────────────────────────
-- 5) 트리거: 이후 모든 INSERT/UPDATE 경로에 동일 규칙 자동 적용
--    (앱, submit_customer_form RPC, Make, REST API 등 어떤 경로로 들어와도
--     이 트리거를 거치므로 별도로 각 경로를 수정할 필요 없음)
--
--    SECURITY DEFINER 불필요: NEW 레코드 값만 계산하고 테이블을 직접
--    조회/수정하지 않으므로 invoker 권한으로 실행해도 안전하며
--    customers_workspace RLS 정책에는 아무 영향이 없음.
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.customers_normalize_region()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- (a) 공백 문자열 → NULL
  IF NEW.region IS NOT NULL AND btrim(NEW.region) = '' THEN
    NEW.region := NULL;
  END IF;

  -- (b) region 에 자유 텍스트가 들어온 경우 (폼 제출 등 모든 진입 경로) →
  --     address 가 비어 있으면 원문을 보존하고, region 은 파싱 결과로 교체
  IF NEW.region IS NOT NULL AND NOT (NEW.region = ANY (public.sido_list())) THEN
    IF NEW.address IS NULL OR btrim(NEW.address) = '' THEN
      NEW.address := NEW.region;
    END IF;
    NEW.region := public.parse_sido(NEW.region);
  END IF;

  -- (c) region 이 비어 있고 address 만 있는 경우 → address 에서 파생.
  --     INSERT 이거나, UPDATE 이면서 address 가 실제로 변경된 경우에만 재계산
  --     (region 을 일부러 비운 사용자의 의도를 존중하기 위해 address 가
  --      그대로인 UPDATE 에서는 재계산하지 않음).
  --     주의: OLD 는 INSERT 트리거에서 "not assigned" 상태라 필드 접근 시
  --     에러가 나므로, TG_OP 분기를 먼저 걸어 OLD.address 참조가 UPDATE
  --     분기 안에서만 평가되도록 구성함 (OR 로 묶어 단락평가에 의존하지 않음).
  IF NEW.region IS NULL AND NEW.address IS NOT NULL AND btrim(NEW.address) <> '' THEN
    IF TG_OP = 'INSERT' THEN
      NEW.region := public.parse_sido(NEW.address);
    ELSIF NEW.address IS DISTINCT FROM OLD.address THEN
      NEW.region := public.parse_sido(NEW.address);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_customers_normalize_region ON public.customers;

CREATE TRIGGER trg_customers_normalize_region
  BEFORE INSERT OR UPDATE ON public.customers
  FOR EACH ROW
  EXECUTE FUNCTION public.customers_normalize_region();


-- ────────────────────────────────────────────────────────────
-- 6) 인덱스 (workspace 격리 + region 필터 복합 인덱스, add_indexes.sql 명명 규칙과 동일)
-- ────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_customers_workspace_region
  ON public.customers (workspace_id, region);


-- ============================================================
-- 검증용 SELECT (마이그레이션 적용 후 수동으로 실행해 확인)
-- ============================================================
-- 1) region 분포 확인
-- SELECT region, count(*) FROM public.customers GROUP BY region ORDER BY count(*) DESC;
--
-- 2) 미해석 목록 — address 는 있으나 region 파싱에 실패한 행
-- SELECT id, company, address, region
-- FROM public.customers
-- WHERE address IS NOT NULL AND region IS NULL
-- ORDER BY created_at DESC;
--
-- 3) parse_sido() 단위 테스트
--    기대값: 강원, 충북, 경남, 서울, NULL
-- SELECT
--   public.parse_sido('강원특별자치도 원주시') AS t1,
--   public.parse_sido('충청북도 옥천군')       AS t2,
--   public.parse_sido('김해')                 AS t3,
--   public.parse_sido('Seoul')                AS t4,
--   public.parse_sido('가나')                 AS t5;
