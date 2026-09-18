-- ============================================================
-- 0005_customers_region_detail.sql
-- customers.region_detail 추가 — 시/군/구 단위 상세 지역
-- ============================================================
--
-- 전제 조건:
--   0004_customers_region_normalize.sql 가 먼저 적용되어 있어야 합니다.
--   (customers.address, public.sido_list(), public.parse_sido(),
--    trg_customers_normalize_region 트리거가 이미 존재해야 함)
--
-- 역할 분담 (0004 이후 3단 구조):
--   customers.region         — 17개 시/도 표준값만 (0004 에서 도입, 필터/인덱스 기준)
--   customers.region_detail  — 시/군/구 표준값 (이번 마이그레이션, public.sigungu_map() 참고)
--   customers.address        — 자유 텍스트 원문 보존 (0004 에서 도입, 절대 정규화하지 않음)
--
-- 이번 변경:
--   1) customers.region_detail (text) 신규 컬럼
--   2) public.sigungu_map()          — 시/도별 시/군/구 표준값 229건, 단일 소스
--   3) public.sigungu_landmark_map() — 대표 지명·신도시 → 시/군/구 매핑 16건
--      (분당→성남시, 판교→성남시, 여의도→영등포구 등)
--   4) public.sido_alias_list()      — parse_sido() 가 인식하는 시/도 접두 별칭 40개
--      (parse_sigungu() 1차 패스에서 "제주도"가 "제주시" 어간과 오매칭되는 것을
--       막는 안전 필터로 사용)
--   5) public.parse_sigungu(text, text) — 자유 텍스트(+ 선택적으로 이미 아는 시/도) →
--      시/군/구 표준값 또는 NULL. src/utils/region.js 의 parseSigungu() 와 완전히
--      동일한 규칙 (한쪽을 수정하면 반드시 다른 쪽도 함께 수정할 것)
--   5-1) public.parse_sido(text) 재정의 — 2026-07-01 출범한 "전남광주통합특별시" 접두 처리
--      (region 값은 광주/전남 17개 체계 유지, 뒤따르는 시/군/구로 광주/전남 판별)
--   6) trg_customers_normalize_region 트리거 함수 재정의 — 기존 (a)(b)(c) 규칙은
--      그대로 두고 region_detail 관련 (d)(e)(f) 규칙만 추가
--   7) 기존 데이터 백필 — region_detail 이 비어 있고 address 가 있는 행에 한해
--      parse_sigungu() 결과로 채움 (예상: 220건 채워짐, 39건은 미해석으로 남음 —
--      "경기도"/"제주도" 처럼 시/도만 있는 값, 또는 파싱 불가능한 값)
--
-- ⚠️ JS/SQL 규칙 동기화 경고:
--   public.sigungu_map() / public.sigungu_landmark_map() / public.sido_alias_list() /
--   public.parse_sido() / public.parse_sigungu() 는 src/utils/region.js 의 SIGUNGU_MAP / LANDMARK_TO_SIGUNGU /
--   SIDO_ALIAS_RE(원본 SIDO_PREFIXES) / parseSigungu() 와 1:1로 대응합니다.
--   한쪽을 수정하면 반드시 다른 쪽도 함께 수정하세요. 두 구현이 갈라지면
--   프론트엔드 표시값과 DB 파생값이 달라져 필터·통계가 어긋납니다.
--
-- 안전성:
--   - 모든 문장이 ADD COLUMN IF NOT EXISTS / CREATE OR REPLACE / DROP ... IF EXISTS
--     로 감싸여 있어 재실행해도 안전합니다 (idempotent). 백필 UPDATE 문도
--     재실행 시 대상 행이 0건이 되도록 WHERE 조건을 설계했습니다.
--   - RLS 정책은 전혀 건드리지 않습니다 (customers_workspace 정책 그대로).
--     트리거 함수는 NEW/OLD 레코드 값만 계산하며 customers 테이블을 직접
--     조회/수정하지 않으므로 SECURITY DEFINER 가 필요 없습니다.
--   - workspace_id, tenant 격리와는 무관한 순수 데이터 정제 작업입니다.
--
-- 실행 방법:
--   Supabase Dashboard > SQL Editor 에 붙여넣기 후 실행
--   또는: supabase db query --linked --file supabase/migrations/0005_customers_region_detail.sql
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- 1) 컬럼 추가: region_detail (시/군/구 표준값)
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS region_detail text;

COMMENT ON COLUMN public.customers.region_detail IS
  '시/군/구 표준값 (public.sigungu_map() 참고). region(시/도) 아래 상세 지역이며, '
  'address(자유 텍스트 원문)에서 trg_customers_normalize_region 트리거가 자동 파생합니다. '
  '직접 입력값(표준 목록에 없는 값)도 허용되며 트리거가 임의로 지우지 않습니다.';


-- ────────────────────────────────────────────────────────────
-- 2) 시/도별 시/군/구 표준값 — 단일 소스 (229건)
--    (src/utils/region.js 의 SIGUNGU_MAP 과 반드시 동일하게 유지)
--
--    2026-07 행정구역 기준:
--      - 대구 군위군: 2023-07 경북 → 대구 편입 (경북 22개, 대구 9개)
--      - 인천 2026-07-01 개편: 중구·동구 → 제물포구(내륙) + 영종구(영종도),
--        서구 → 서구 + 검단구 (9구 2군 = 11개). 옛 "인천 동구" 는 전역이 제물포구에
--        포함되어 landmark 별칭으로 매핑, 옛 "인천 중구" 는 제물포구/영종구로 갈려 매핑하지 않음
--      - 강원특별자치도(2023-06) / 전북특별자치도(2024-01): 시/도 명칭만 변경,
--        산하 시/군 구성은 동일
--      - 세종특별자치시: 산하 시/군/구 없음 (행 없음)
--      - 제주: 행정시(제주시·서귀포시) 2개만 (기초자치단체 아님)
--      - 도(道) 산하 시의 일반구(수원시 팔달구 등)는 포함하지 않음 —
--        상세지역은 기초자치단체(시/군/구) 단위까지만
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sigungu_map()
RETURNS TABLE(sido text, name text)
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT * FROM (VALUES
    ('서울','종로구'),
    ('서울','중구'),
    ('서울','용산구'),
    ('서울','성동구'),
    ('서울','광진구'),
    ('서울','동대문구'),
    ('서울','중랑구'),
    ('서울','성북구'),
    ('서울','강북구'),
    ('서울','도봉구'),
    ('서울','노원구'),
    ('서울','은평구'),
    ('서울','서대문구'),
    ('서울','마포구'),
    ('서울','양천구'),
    ('서울','강서구'),
    ('서울','구로구'),
    ('서울','금천구'),
    ('서울','영등포구'),
    ('서울','동작구'),
    ('서울','관악구'),
    ('서울','서초구'),
    ('서울','강남구'),
    ('서울','송파구'),
    ('서울','강동구'),
    ('부산','중구'),
    ('부산','서구'),
    ('부산','동구'),
    ('부산','영도구'),
    ('부산','부산진구'),
    ('부산','동래구'),
    ('부산','남구'),
    ('부산','북구'),
    ('부산','해운대구'),
    ('부산','사하구'),
    ('부산','금정구'),
    ('부산','강서구'),
    ('부산','연제구'),
    ('부산','수영구'),
    ('부산','사상구'),
    ('부산','기장군'),
    ('대구','중구'),
    ('대구','동구'),
    ('대구','서구'),
    ('대구','남구'),
    ('대구','북구'),
    ('대구','수성구'),
    ('대구','달서구'),
    ('대구','달성군'),
    ('대구','군위군'),
    ('인천','제물포구'),
    ('인천','영종구'),
    ('인천','미추홀구'),
    ('인천','연수구'),
    ('인천','남동구'),
    ('인천','부평구'),
    ('인천','계양구'),
    ('인천','서구'),
    ('인천','검단구'),
    ('인천','강화군'),
    ('인천','옹진군'),
    ('광주','동구'),
    ('광주','서구'),
    ('광주','남구'),
    ('광주','북구'),
    ('광주','광산구'),
    ('대전','동구'),
    ('대전','중구'),
    ('대전','서구'),
    ('대전','유성구'),
    ('대전','대덕구'),
    ('울산','중구'),
    ('울산','남구'),
    ('울산','동구'),
    ('울산','북구'),
    ('울산','울주군'),
    ('경기','수원시'),
    ('경기','성남시'),
    ('경기','고양시'),
    ('경기','용인시'),
    ('경기','부천시'),
    ('경기','안산시'),
    ('경기','안양시'),
    ('경기','남양주시'),
    ('경기','화성시'),
    ('경기','평택시'),
    ('경기','의정부시'),
    ('경기','시흥시'),
    ('경기','파주시'),
    ('경기','김포시'),
    ('경기','광명시'),
    ('경기','광주시'),
    ('경기','군포시'),
    ('경기','하남시'),
    ('경기','오산시'),
    ('경기','이천시'),
    ('경기','양주시'),
    ('경기','구리시'),
    ('경기','안성시'),
    ('경기','포천시'),
    ('경기','의왕시'),
    ('경기','여주시'),
    ('경기','동두천시'),
    ('경기','과천시'),
    ('경기','양평군'),
    ('경기','가평군'),
    ('경기','연천군'),
    ('강원','춘천시'),
    ('강원','원주시'),
    ('강원','강릉시'),
    ('강원','동해시'),
    ('강원','태백시'),
    ('강원','속초시'),
    ('강원','삼척시'),
    ('강원','홍천군'),
    ('강원','횡성군'),
    ('강원','영월군'),
    ('강원','평창군'),
    ('강원','정선군'),
    ('강원','철원군'),
    ('강원','화천군'),
    ('강원','양구군'),
    ('강원','인제군'),
    ('강원','고성군'),
    ('강원','양양군'),
    ('충북','청주시'),
    ('충북','충주시'),
    ('충북','제천시'),
    ('충북','보은군'),
    ('충북','옥천군'),
    ('충북','영동군'),
    ('충북','증평군'),
    ('충북','진천군'),
    ('충북','괴산군'),
    ('충북','음성군'),
    ('충북','단양군'),
    ('충남','천안시'),
    ('충남','공주시'),
    ('충남','보령시'),
    ('충남','아산시'),
    ('충남','서산시'),
    ('충남','논산시'),
    ('충남','계룡시'),
    ('충남','당진시'),
    ('충남','금산군'),
    ('충남','부여군'),
    ('충남','서천군'),
    ('충남','청양군'),
    ('충남','홍성군'),
    ('충남','예산군'),
    ('충남','태안군'),
    ('전북','전주시'),
    ('전북','군산시'),
    ('전북','익산시'),
    ('전북','정읍시'),
    ('전북','남원시'),
    ('전북','김제시'),
    ('전북','완주군'),
    ('전북','진안군'),
    ('전북','무주군'),
    ('전북','장수군'),
    ('전북','임실군'),
    ('전북','순창군'),
    ('전북','고창군'),
    ('전북','부안군'),
    ('전남','목포시'),
    ('전남','여수시'),
    ('전남','순천시'),
    ('전남','나주시'),
    ('전남','광양시'),
    ('전남','담양군'),
    ('전남','곡성군'),
    ('전남','구례군'),
    ('전남','고흥군'),
    ('전남','보성군'),
    ('전남','화순군'),
    ('전남','장흥군'),
    ('전남','강진군'),
    ('전남','해남군'),
    ('전남','영암군'),
    ('전남','무안군'),
    ('전남','함평군'),
    ('전남','영광군'),
    ('전남','장성군'),
    ('전남','완도군'),
    ('전남','진도군'),
    ('전남','신안군'),
    ('경북','포항시'),
    ('경북','경주시'),
    ('경북','김천시'),
    ('경북','안동시'),
    ('경북','구미시'),
    ('경북','영주시'),
    ('경북','영천시'),
    ('경북','상주시'),
    ('경북','문경시'),
    ('경북','경산시'),
    ('경북','의성군'),
    ('경북','청송군'),
    ('경북','영양군'),
    ('경북','영덕군'),
    ('경북','청도군'),
    ('경북','고령군'),
    ('경북','성주군'),
    ('경북','칠곡군'),
    ('경북','예천군'),
    ('경북','봉화군'),
    ('경북','울진군'),
    ('경북','울릉군'),
    ('경남','창원시'),
    ('경남','진주시'),
    ('경남','통영시'),
    ('경남','사천시'),
    ('경남','김해시'),
    ('경남','밀양시'),
    ('경남','거제시'),
    ('경남','양산시'),
    ('경남','의령군'),
    ('경남','함안군'),
    ('경남','창녕군'),
    ('경남','고성군'),
    ('경남','남해군'),
    ('경남','하동군'),
    ('경남','산청군'),
    ('경남','함양군'),
    ('경남','거창군'),
    ('경남','합천군'),
    ('제주','제주시'),
    ('제주','서귀포시')
  ) AS m(sido, name);
$$;

COMMENT ON FUNCTION public.sigungu_map() IS
  '시/도별 시/군/구 표준값 229건. customers.region_detail 이 가질 수 있는 표준 후보 집합 '
  '(직접 입력값은 이 목록 밖에 있을 수 있음). src/utils/region.js 의 SIGUNGU_MAP 과 동일하게 유지.';


-- ────────────────────────────────────────────────────────────
-- 3) 대표 지명·신도시·옛 명칭 → 시/군/구 매핑 (16건)
--    (src/utils/region.js 의 LANDMARK_TO_SIGUNGU 와 반드시 동일하게 유지)
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sigungu_landmark_map()
RETURNS TABLE(sido text, alias text, name text)
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT * FROM (VALUES
    ('서울','여의도','영등포구'),
    ('서울','홍대','마포구'),
    ('서울','잠실','송파구'),
    ('서울','천호동','강동구'),
    ('서울','방이동','송파구'),
    ('서울','성수동','성동구'),
    ('서울','목동','양천구'),
    ('인천','송도','연수구'),
    ('인천','영종','영종구'),
    ('인천','검단','검단구'),
    ('인천','동구','제물포구'),
    ('경기','분당','성남시'),
    ('경기','판교','성남시'),
    ('경기','일산','고양시'),
    ('경기','동탄','화성시'),
    ('경기','광교','수원시')
  ) AS m(sido, alias, name);
$$;

COMMENT ON FUNCTION public.sigungu_landmark_map() IS
  '대표 지명·신도시 → 시/군/구 매핑 16건 (parse_sido() 의 시/군/구 지명 매칭과 짝을 이룸). '
  'src/utils/region.js 의 LANDMARK_TO_SIGUNGU 와 동일하게 유지.';


-- ────────────────────────────────────────────────────────────
-- 4) 시/도 접두 별칭 목록 (40개) — parse_sigungu() 1차 패스의 안전 필터
--    (src/utils/region.js 의 SIDO_ALIAS_RE / SIDO_PREFIXES 원본 접두어 집합과 동일)
--
--    쓰임새: "제주도" 를 시/군/구로 파싱할 때, "제주시" 의 어간 "제주" 가
--    시/도 별칭 "제주" 와 우연히 같아서 1차 패스(원문 그대로 매칭)에서
--    "제주시" 로 오매칭되는 것을 막는다. 시/도 표기를 이미 떼어낸 2차/3차
--    패스에서는 이 필터를 적용하지 않는다 ("경기광주" → 광주시 는 허용).
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sido_alias_list()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT ARRAY[
    'gyeongbuk','gyeongnam','gyeonggi','chungbuk','chungnam','incheon','gwangju',
    'daejeon','gangwon','jeonbuk','jeonnam','sejong','seoul','busan','daegu','ulsan','jeju',
    '충청북','충청남','전라북','전라남','경상북','경상남',
    '서울','부산','대구','인천','광주','대전','울산','세종',
    '경기','강원','충북','충남','전북','전남','경북','경남','제주'
  ];
$$;

COMMENT ON FUNCTION public.sido_alias_list() IS
  'parse_sido() 가 인식하는 시/도 접두 별칭 40개 (영문 17 + 한글 3글자 축약 6 + 한글 2글자 표준 17). '
  'parse_sigungu() 1차 패스에서 시/군/구 어간이 시/도 별칭과 겹치는 오매칭을 막는 안전 필터로 사용.';


-- ────────────────────────────────────────────────────────────
-- 5) 시/군/구 매칭 헬퍼 — 후보 패턴(전체명 + 어간 + 지명) 중 최장 일치 반환
--    (parse_sigungu() 의 3개 패스에서 공통으로 사용. p_safe=true 이면 시/도
--    별칭과 겹치는 패턴을 제외한다 — src/utils/region.js SIGUNGU_PATTERNS.safe)
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._sigungu_match(p_text text, p_sido text, p_safe boolean DEFAULT false)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT m.name
  FROM (
    -- 전체명 (예: "남양주시")
    SELECT name AS pat, name
    FROM public.sigungu_map()
    WHERE sido = p_sido

    UNION ALL

    -- 어간 (예: "남양주시" → "남양주"). 1글자 어간(중·동·서·남·북)은
    -- 오탐 위험이 커서 전체명으로만 매칭하도록 2글자 이상만 포함.
    SELECT regexp_replace(name, '(시|군|구)$', '') AS pat, name
    FROM public.sigungu_map()
    WHERE sido = p_sido
      AND length(regexp_replace(name, '(시|군|구)$', '')) >= 2

    UNION ALL

    -- 대표 지명 (예: "분당" → "성남시")
    SELECT alias AS pat, name
    FROM public.sigungu_landmark_map()
    WHERE sido = p_sido
  ) m
  WHERE p_text LIKE m.pat || '%'
    AND (NOT p_safe OR m.pat <> ALL (public.sido_alias_list()))
  ORDER BY length(m.pat) DESC, m.pat DESC
  LIMIT 1;
$$;

COMMENT ON FUNCTION public._sigungu_match(text, text, boolean) IS
  'parse_sigungu() 내부 헬퍼. 지정된 시/도의 후보 패턴(전체명/어간/지명) 중 p_text 의 '
  '접두어와 일치하는 가장 긴 패턴의 시/군/구 표준명을 반환. 직접 호출용이 아님.';


-- ────────────────────────────────────────────────────────────
-- 5-1) parse_sido() 재정의 — 0004 본문 그대로 + 전남광주통합특별시 접두 처리(0-1단계) 추가
--      (src/utils/region.js parseSido() 와 동일. 시그니처 동일하므로 CREATE OR REPLACE 로
--       교체되며 0004 에서 부여한 권한은 유지됨. _sigungu_match() 를 사용하므로 5) 뒤에 위치)
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
  v_rest     text;   -- 통합특별시 접두를 뗀 나머지
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

  -- 0-1단계: 전남광주통합특별시(2026-07-01 출범) 접두 → 뒤따르는 시/군/구로 광주/전남 판별.
  --          region 은 데이터·필터 호환을 위해 광주/전남을 분리한 17개 체계를 유지한다.
  --          일반 접두 규칙보다 먼저 처리 (그냥 두면 "전남" 접두로 오인됨).
  --          광산구·동구·서구·남구·북구 → 광주, 22개 시·군 → 전남, 판별 불가 → NULL.
  v_rest := regexp_replace(v, '^(전남광주통합특별시|전남광주특별시|전남광주)[\s,]*', '');
  IF v_rest <> v THEN
    IF v_rest = '' THEN
      RETURN NULL;
    END IF;
    IF public._sigungu_match(v_rest, '광주', false) IS NOT NULL THEN
      RETURN '광주';
    END IF;
    IF public._sigungu_match(v_rest, '전남', false) IS NOT NULL THEN
      RETURN '전남';
    END IF;
    RETURN NULL;
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
  '자유 텍스트 주소/지역 → 17개 표준 시/도 값 또는 NULL. 전남광주통합특별시 접두는 뒤의 시/군/구로 '
  '광주/전남 판별 (0005). src/utils/region.js 의 parseSido() 와 동일한 규칙 — 한쪽 수정 시 반드시 함께 수정할 것.';

GRANT EXECUTE ON FUNCTION public.parse_sido(text) TO anon, authenticated;


-- ────────────────────────────────────────────────────────────
-- 6) 자유 텍스트 → 시/군/구 표준값 파싱 함수
--    src/utils/region.js parseSigungu() 와 동일한 규칙:
--      0) 정규화(공백 정리, 소문자화). 시/도를 모르면 parse_sido() 로 추정.
--         시/도를 못 정하면 NULL.
--      1차) 원문 그대로, "안전" 패턴만 매칭 (시/도 별칭과 겹치는 어간 제외)
--      2차) 문자열 맨 앞의 시/도 표기(별칭)를 제거한 뒤, 전체 패턴으로 매칭
--      3차) 2차 결과에서 남은 광역시/특별시/도/시 접미까지 제거한 뒤 매칭
--      그 외에는 NULL (미해석 — 원문은 address 에 그대로 남음)
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.parse_sigungu(p_text text, p_sido text DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v        text;
  v_sido   text;
  v2       text;
  v3       text;
  v_result text;
BEGIN
  IF p_text IS NULL THEN
    RETURN NULL;
  END IF;

  -- 공백 정리 + 소문자화 (0004 parse_sido() 와 동일한 정규화)
  v := lower(regexp_replace(btrim(p_text), '\s+', ' ', 'g'));

  IF v = '' THEN
    RETURN NULL;
  END IF;

  -- 시/도가 이미 표준값으로 주어지면 그대로 사용, 아니면 원문에서 추정
  v_sido := CASE
              WHEN p_sido = ANY (public.sido_list()) THEN p_sido
              ELSE public.parse_sido(p_text)
            END;

  IF v_sido IS NULL THEN
    RETURN NULL;
  END IF;

  -- 통합특별시 접두("전남광주통합특별시 …")는 시/군/구 매칭에 방해만 되므로 먼저 제거
  -- (parseSigungu() 의 stripUnifiedPrefix 와 동일)
  v := regexp_replace(v, '^(전남광주통합특별시|전남광주특별시|전남광주)[\s,]*', '');
  IF v = '' THEN
    RETURN NULL;
  END IF;

  -- 1차: 원문 그대로, 안전 패턴만 (시/도 별칭과 겹치는 어간 제외 —
  --      "제주도" 가 "제주시" 어간 "제주" 로 오매칭되는 것을 방지)
  v_result := public._sigungu_match(v, v_sido, true);
  IF v_result IS NOT NULL THEN
    RETURN v_result;
  END IF;

  -- 2차: 맨 앞의 시/도 표기(별칭)를 제거한 뒤, 전체 패턴(어간 포함)으로 매칭
  --      ("경기광주" → "경기" 제거 → "광주" → 어간 매칭으로 광주시)
  v2 := regexp_replace(v, '^(gyeongbuk|gyeongnam|gyeonggi|chungbuk|chungnam|incheon|gwangju|daejeon|gangwon|jeonbuk|jeonnam|sejong|seoul|busan|daegu|ulsan|jeju|충청북|충청남|전라북|전라남|경상북|경상남|서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주)', '');
  v2 := regexp_replace(v2, '^[\s,]+', '');

  IF v2 <> v THEN
    v_result := public._sigungu_match(v2, v_sido, false);
    IF v_result IS NOT NULL THEN
      RETURN v_result;
    END IF;

    -- 3차: 2차에서 남은 광역시/특별시/도/시 접미까지 제거한 뒤 매칭
    --      ("서울시 강남구" → "경기"류 접두 제거로는 안 남지만 "시" 접미가
    --       남는 경우, "제주특별자치도 서귀포시" → "특별자치도" 제거)
    v3 := regexp_replace(v2, '^(특별자치시|특별자치도|광역시|특별시|도|시)', '');
    v3 := regexp_replace(v3, '^[\s,]+', '');

    IF v3 <> v2 AND v3 <> '' THEN
      v_result := public._sigungu_match(v3, v_sido, false);
      IF v_result IS NOT NULL THEN
        RETURN v_result;
      END IF;
    END IF;
  END IF;

  RETURN NULL; -- 미해석 (원문은 address 에 보존됨)
END;
$$;

COMMENT ON FUNCTION public.parse_sigungu(text, text) IS
  '자유 텍스트 주소/지역 (+ 선택적으로 이미 아는 시/도) → 시/군/구 표준값 또는 NULL. '
  'src/utils/region.js 의 parseSigungu() 와 동일한 규칙 — 한쪽 수정 시 반드시 함께 수정할 것.';

GRANT EXECUTE ON FUNCTION
  public.sigungu_map(),
  public.sigungu_landmark_map(),
  public.sido_alias_list(),
  public._sigungu_match(text, text, boolean),
  public.parse_sigungu(text, text)
TO anon, authenticated;


-- ────────────────────────────────────────────────────────────
-- 7) 트리거 함수 재정의 — 기존 (a)(b)(c) 는 그대로, region_detail 규칙 (d)(e)(f) 추가
--
--    SECURITY DEFINER 불필요: NEW/OLD 레코드 값만 계산하고 테이블을 직접
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

  -- (d) region_detail 공백 문자열 → NULL
  IF NEW.region_detail IS NOT NULL AND btrim(NEW.region_detail) = '' THEN
    NEW.region_detail := NULL;
  END IF;

  -- (e) UPDATE 에서 region(시/도) 만 바뀌고 region_detail 은 그대로인데, 그 값이
  --     이전 시/도의 표준 시/군/구였고 새 시/도의 목록에는 없으면 → 오래된 값이므로
  --     NULL 처리 (예: 서울→경기 로 바꿨는데 "강남구" 가 그대로 남는 것을 방지).
  --     "중구" 처럼 양쪽 시/도에 모두 있는 이름은 유지된다.
  --     주의: OLD 참조는 반드시 TG_OP = 'UPDATE' 로 먼저 분기한 뒤에만 평가한다
  --     (PL/pgSQL 은 AND 체인 전체를 하나의 SQL 표현식으로 미리 준비할 수 있어
  --      단락평가에 의존하면 INSERT 트리거에서 "record OLD is not assigned" 에러가
  --      날 수 있으므로, (c) 와 마찬가지로 IF TG_OP = 'UPDATE' THEN ... END IF 로 감쌈).
  IF TG_OP = 'UPDATE' THEN
    IF NEW.region IS DISTINCT FROM OLD.region
       AND NEW.region_detail IS NOT DISTINCT FROM OLD.region_detail
       AND NEW.region_detail IS NOT NULL
       AND EXISTS (
             SELECT 1 FROM public.sigungu_map() m
             WHERE m.sido = OLD.region AND m.name = NEW.region_detail
           )
       AND NOT EXISTS (
             SELECT 1 FROM public.sigungu_map() m
             WHERE m.sido = NEW.region AND m.name = NEW.region_detail
           )
    THEN
      NEW.region_detail := NULL;
    END IF;
  END IF;

  -- (f) region_detail 이 비어 있고 address 가 있으면 파생.
  --     INSERT 이거나, UPDATE 이면서 address 가 실제로 변경된 경우에만 재계산
  --     ((c) 와 동일한 이유로 region_detail 을 일부러 비운 의도를 존중).
  IF NEW.region_detail IS NULL AND NEW.address IS NOT NULL AND btrim(NEW.address) <> '' THEN
    IF TG_OP = 'INSERT' THEN
      NEW.region_detail := public.parse_sigungu(NEW.address, NEW.region);
    ELSIF NEW.address IS DISTINCT FROM OLD.address THEN
      NEW.region_detail := public.parse_sigungu(NEW.address, NEW.region);
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
-- 8) 기존 데이터 백필 (트리거 생성 후 실행 — 재실행 안전)
--    region_detail 이 이미 채워진 행(트리거가 이미 채웠거나 직접 입력값이 있는
--    행)은 절대 건드리지 않는다. address 가 있고 region_detail 이 비어 있으며
--    파싱에 성공하는 행만 대상 — 재실행 시 대상 행이 0건이 되므로 idempotent.
-- ────────────────────────────────────────────────────────────

-- 사전 집계 (실행 전 확인용) — 기대값: 220건
-- SELECT count(*)
-- FROM public.customers
-- WHERE region_detail IS NULL AND address IS NOT NULL AND btrim(address) <> ''
--   AND public.parse_sigungu(address, region) IS NOT NULL;

UPDATE public.customers
SET region_detail = public.parse_sigungu(address, region)
WHERE region_detail IS NULL
  AND address IS NOT NULL
  AND btrim(address) <> ''
  AND public.parse_sigungu(address, region) IS NOT NULL;


-- ────────────────────────────────────────────────────────────
-- 9) 인덱스: 추가하지 않음
--    0004 의 idx_customers_workspace_region (workspace_id, region) 이 이미
--    테이블 스캔을 좁혀주고, region_detail 은 그 위에 얹는 2차 필터일 뿐이며
--    customers 테이블 자체가 크지 않음 (2,765건) — 별도 인덱스는 과설계.
--    필터/통계 쿼리가 실제로 느려지면 그때 (workspace_id, region, region_detail)
--    복합 인덱스를 재검토한다.
-- ────────────────────────────────────────────────────────────


-- ============================================================
-- 검증용 SELECT (마이그레이션 적용 후 수동으로 실행해 확인)
-- ============================================================
-- 1) region / region_detail 분포 확인
-- SELECT region, region_detail, count(*)
-- FROM public.customers
-- GROUP BY 1, 2
-- ORDER BY 3 DESC;
--
-- 2) 미해석 목록 — address 는 있으나 region_detail 파싱에 실패한 행
--    (기대: 39건 — "경기도"/"제주도" 처럼 시/도만 있는 값, 오타/쓰레기 값 등)
-- SELECT id, company, address, region, region_detail
-- FROM public.customers
-- WHERE address IS NOT NULL AND region_detail IS NULL
-- ORDER BY created_at DESC;
--
-- 3) parse_sigungu() 단위 테스트
--    기대값: 남양주시, 강남구, 성남시, NULL, 서귀포시, 광주시, 강남구, NULL, 중구, 천안시
-- SELECT
--   public.parse_sigungu('경기도 남양주시 다산동')          AS t1,
--   public.parse_sigungu('서울시 강남구')                   AS t2,
--   public.parse_sigungu('성남시 분당구')                   AS t3,
--   public.parse_sigungu('제주도')                          AS t4,
--   public.parse_sigungu('제주특별자치도 서귀포시')         AS t5,
--   public.parse_sigungu('경기광주')                        AS t6,
--   public.parse_sigungu('강남구 테헤란로 123', '서울')     AS t7,
--   public.parse_sigungu('중구')                            AS t8,
--   public.parse_sigungu('중구', '대전')                    AS t9,
--   public.parse_sigungu('천안충남')                        AS t10;
--
-- 4) 전남광주통합특별시 접두 처리 (2026-07-01)
--    기대값: 광주, 전남, 광주, 전남, NULL, NULL, 광산구, 순천시, 동구, NULL
-- SELECT
--   public.parse_sido('전남광주통합특별시 광산구 첨단동')      AS s1,
--   public.parse_sido('전남광주특별시 순천시')               AS s2,
--   public.parse_sido('전남광주 동구')                       AS s3,
--   public.parse_sido('전남광주 여수')                       AS s4,
--   public.parse_sido('전남광주')                            AS s5,
--   public.parse_sido('전남광주 강남구')                     AS s6,
--   public.parse_sigungu('전남광주통합특별시 광산구 첨단동')  AS g1,
--   public.parse_sigungu('전남광주특별시 순천시')            AS g2,
--   public.parse_sigungu('전남광주 동구')                    AS g3,
--   public.parse_sigungu('전남광주')                         AS g4;
