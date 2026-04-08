// ============================================================
// FUNDIT — 구글 폼 → Supabase customers 테이블 자동 연동
// 파일: googlesheet_to_supabase.gs
//
// [설정 방법]
// 1. Google Apps Script 에디터 열기:
//    시트 메뉴 → 확장 프로그램 → Apps Script
//
// 2. Script Properties 설정 (⚠️ 코드에 직접 키 입력 금지):
//    Apps Script 에디터 → 프로젝트 설정(⚙️) → 스크립트 속성 → 속성 추가
//    - SUPABASE_URL  : https://ddivdcsierbngtuxtdyu.supabase.co
//    - SUPABASE_KEY  : (ANON KEY — .env 파일의 VITE_SUPABASE_ANON_KEY 값)
//
// 3. 트리거 설정:
//    Apps Script 에디터 → 트리거(⏰) → 트리거 추가
//    - 실행할 함수: onFormSubmit
//    - 이벤트 소스: 스프레드시트에서
//    - 이벤트 유형: 양식 제출 시
//
// 4. 처음 실행 시 Google 계정 권한 승인 필요
// ============================================================

// ── 시트 컬럼 인덱스 정의 (0-based) ────────────────────────
// 구글 폼 응답 시트의 컬럼 순서와 일치해야 합니다.
// 컬럼 순서가 바뀌면 여기 숫자만 수정하세요.
var COL = {
  제출일시:      0,   // A: 제출일시
  유입채널:      1,   // B: 유입채널
  업체명:        2,   // C: 이름 또는 업체명
  전화번호:      3,   // D: 전화번호
  사업자번호:    4,   // E: 사업자번호
  사업자상태:    5,   // F: 사업자상태
  사업자유형:    6,   // G: 사업자유형
  업종:          7,   // H: 업종
  사업운영기간:  8,   // I: 사업운영기간
  월평균매출:    9,   // J: 월평균매출
  지역:          10,  // K: 지역
  국세체납여부:  11,  // L: 국세체납여부 (있음/없음)
  AI추천기관:    12,  // M: AI추천기관
  AI예상금액:    13,  // N: AI예상금액
  AI분석결과:    14,  // O: AI분석결과
  // ⚠️ 아래 컬럼은 구글 폼에 해당 질문이 추가된 경우에만 활성화하세요.
  // 컬럼 인덱스(숫자)를 실제 시트 순서에 맞게 수정해야 합니다.
  // 연체이력:      15,  // P: 연체이력 (있음/없음)
  // 회생파산복구:  16,  // Q: 회생/파산복구 (있음/없음)
  // 폐업이력:      17,  // R: 폐업이력 (있음/없음)
  // 정책자금사용:  18,  // S: 정책자금 사용여부 (있음/없음)
  // 스마트기기:    19,  // T: 스마트기기 이용여부 (있음/없음)
  // 수출여부:      20,  // U: 수출여부 (있음/없음)
};

// ── 워크스페이스 ID ─────────────────────────────────────────
var WORKSPACE_ID = 'a1650b9e-31da-43e6-9179-17390d06f58c';

// ── 메인 트리거 함수 (외부 폼 → 시트 행 추가 시 자동 실행) ──
// 트리거 설정: 이벤트 소스 = 스프레드시트에서 / 이벤트 유형 = 변경 시
function onSheetChange(e) {
  // 행 추가(INSERT_ROW)일 때만 처리
  if (e && e.changeType !== 'INSERT_ROW') return;

  try {
    var row = getLastRow();
    if (!row) {
      Logger.log('[ERROR] 행 데이터를 가져올 수 없습니다.');
      return;
    }

    // 업체명(COL.업체명)이 비어 있으면 헤더행 또는 빈 행 → 스킵
    if (!row[COL.업체명] || String(row[COL.업체명]).trim() === '') {
      Logger.log('[SKIP] 빈 행 또는 헤더행 감지, 처리 생략');
      return;
    }

    var customer = buildCustomerPayload(row);
    var result   = insertToSupabase(customer);

    if (result.success) {
      Logger.log('[OK] 고객사 등록 완료: ' + customer.company);
    } else {
      Logger.log('[ERROR] Supabase 응답: ' + result.message);
      sendErrorAlert(customer.company, result.message);
    }

  } catch (err) {
    Logger.log('[EXCEPTION] ' + err.toString());
    sendErrorAlert('알 수 없음', err.toString());
  }
}

// ── 시트에서 마지막 행 읽기 ──────────────────────────────────
function getLastRow() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet()
                             .getSheetByName('종합시트');
  if (!sheet) {
    Logger.log('[ERROR] "종합시트" 시트를 찾을 수 없습니다.');
    return null;
  }
  var lastRow  = sheet.getLastRow();
  var numCols  = sheet.getLastColumn();
  if (lastRow < 2) return null; // 헤더만 있는 경우
  var rowRange = sheet.getRange(lastRow, 1, 1, numCols);
  return rowRange.getValues()[0];
}

// ── Supabase INSERT 페이로드 생성 ───────────────────────────
function buildCustomerPayload(row) {
  var company       = cleanString(row[COL.업체명]);
  var phone         = cleanString(row[COL.전화번호]);
  var leadSource    = cleanString(row[COL.유입채널]);
  var businessType  = cleanString(row[COL.사업자유형]);
  var industry      = cleanString(row[COL.업종]);
  var region        = cleanString(row[COL.지역]);
  var businessAge  = cleanString(row[COL.사업운영기간]);
  var monthlyRev   = cleanString(row[COL.월평균매출]);
  var receivedDate  = parseDateSafe(row[COL.제출일시]);

  // ── Boolean 필드 파싱 ────────────────────────────────────────
  // parseBoolean() 규칙: "있음"/"예"/"Y"/"true"/"1" → true, 그 외("없음" 포함) → false
  // ⚠️ 반전 로직 없음 — "있음" = true, "없음" = false 그대로 DB에 저장
  var taxDelinquent   = parseBoolean(row[COL.국세체납여부]);
  // 아래 필드는 COL에서 해당 인덱스를 활성화(주석 해제)한 뒤 사용하세요
  var overdueHistory  = COL.연체이력    !== undefined ? parseBoolean(row[COL.연체이력])    : null;
  var rehabilitation  = COL.회생파산복구 !== undefined ? parseBoolean(row[COL.회생파산복구]) : null;
  var closureHistory  = COL.폐업이력    !== undefined ? parseBoolean(row[COL.폐업이력])    : null;
  var policyFundUsage = COL.정책자금사용 !== undefined ? parseBoolean(row[COL.정책자금사용]) : null;
  var smartDevice     = COL.스마트기기   !== undefined ? parseBoolean(row[COL.스마트기기])   : null;
  var isExporter      = COL.수출여부     !== undefined ? parseBoolean(row[COL.수출여부])     : null;

  // 사업자번호 → business_reg_no 직접 매칭
  var bizNum    = cleanString(row[COL.사업자번호]);
  var bizStatus = cleanString(row[COL.사업자상태]);

  // 사업자상태만 tags에 저장
  var tags = [];
  if (bizStatus) tags.push('사업자상태:' + bizStatus);

  // AI 분석 결과 → consultation_memo로 합산
  var aiOrg      = cleanString(row[COL.AI추천기관]);
  var aiAmount   = cleanString(row[COL.AI예상금액]);
  var aiAnalysis = cleanString(row[COL.AI분석결과]);
  var memo = buildMemo(aiOrg, aiAmount, aiAnalysis);

  // AI 예상금액 → required_funds (숫자 추출)
  var requiredFunds = parseNumericSafe(row[COL.AI예상금액]);

  return {
    workspace_id:      WORKSPACE_ID,
    company:           company || '(이름 없음)',
    phone:             phone,
    lead_source:       leadSource,
    business_type:     businessType,
    industry:          industry,
    region:            region,
    business_age:      businessAge,
    monthly_revenue:   monthlyRev,
    // ── Boolean 필드 (있음=true, 없음=false — parseBoolean() 기준, 반전 없음) ──
    tax_delinquent:    taxDelinquent,
    overdue_history:   overdueHistory,
    rehabilitation:    rehabilitation,
    closure_history:   closureHistory,
    policy_fund_usage: policyFundUsage,
    smart_device:      smartDevice,
    is_exporter:       isExporter,
    required_funds:    requiredFunds,
    consultation_memo: memo,
    tags:              tags.length > 0 ? tags : null,
    received_date:     receivedDate,
    business_reg_no:   bizNum,
    status:            '신규',       // 초기 CRM 상태
    score:             0,
    pool:              false,
  };
}

// ── Supabase RPC 호출 (submit_customer_form) ────────────────
// 직접 INSERT 대신 SECURITY DEFINER RPC 사용
// → anon 키로도 RLS 우회 가능, 서비스 키 불필요
function insertToSupabase(payload) {
  var props = PropertiesService.getScriptProperties();
  var url   = props.getProperty('SUPABASE_URL')
              || 'https://ddivdcsierbngtuxtdyu.supabase.co';
  var key   = props.getProperty('SUPABASE_KEY')
              || 'sb_publishable_VTfgbfTQGpLsWi6cjgrFvQ_OezMLa1C';

  // REST 파라미터명은 함수 인자명 앞에 p_ 제거한 형태로 전달
  var rpcPayload = {
    p_workspace_id:      payload.workspace_id,
    p_company:           payload.company,
    p_phone:             payload.phone,
    p_lead_source:       payload.lead_source,
    p_business_type:     payload.business_type,
    p_industry:          payload.industry,
    p_region:            payload.region,
    p_business_age:      payload.business_age,
    p_monthly_revenue:   payload.monthly_revenue,
    // ── Boolean 필드 (null이면 RPC에서 DB 기본값 사용) ──────────
    p_tax_delinquent:    payload.tax_delinquent,
    p_required_funds:    payload.required_funds,
    p_consultation_memo: payload.consultation_memo,
    p_tags:              payload.tags,
    p_received_date:     payload.received_date,
    p_business_reg_no:   payload.business_reg_no,
  };

  var endpoint = url + '/rest/v1/rpc/submit_customer_form';

  var options = {
    method:      'POST',
    contentType: 'application/json',
    headers: {
      'apikey':        key,
      'Authorization': 'Bearer ' + key,
    },
    payload:            JSON.stringify(rpcPayload),
    muteHttpExceptions: true,
  };

  var response = UrlFetchApp.fetch(endpoint, options);
  var code     = response.getResponseCode();

  if (code === 200) {
    return { success: true };
  } else {
    return {
      success: false,
      message: 'HTTP ' + code + ' — ' + response.getContentText(),
    };
  }
}

// ── 에러 알림 이메일 (선택) ─────────────────────────────────
// 오류 시 스프레드시트 소유자에게 이메일 발송
// 불필요하면 이 함수 내용을 지우세요.
function sendErrorAlert(company, message) {
  var email   = Session.getEffectiveUser().getEmail();
  var subject = '[FUNDIT] 고객사 등록 실패: ' + company;
  var body    = '고객사: ' + company + '\n\n오류:\n' + message;
  MailApp.sendEmail(email, subject, body);
}

// ── 유틸리티 함수 ───────────────────────────────────────────

function cleanString(val) {
  if (val === null || val === undefined) return null;
  var s = String(val).trim();
  return s === '' ? null : s;
}

// 정수 추출 — business_age/monthly_revenue에는 사용 금지 (text 컬럼)
// required_funds 등 순수 숫자 필드에만 사용
function parseIntSafe(val) {
  if (val === null || val === undefined || val === '') return null;
  var s = String(val).replace(/[^0-9]/g, '');
  if (s === '') return null;
  var n = parseInt(s, 10);
  return isNaN(n) ? null : n;
}

// 숫자 추출 — business_age/monthly_revenue에는 사용 금지 (text 컬럼)
// "500만원", "1,200,000" 등 순수 숫자 필드에만 사용 (만원 단위 → 원으로 변환)
function parseNumericSafe(val) {
  if (val === null || val === undefined || val === '') return null;
  var s = String(val).replace(/,/g, '').trim();

  // 만원 단위 명시된 경우 → 10000 곱하기
  if (s.indexOf('만') !== -1) {
    s = s.replace(/[^0-9.]/g, '');
    var n = parseFloat(s);
    return isNaN(n) ? null : Math.round(n * 10000);
  }

  s = s.replace(/[^0-9.]/g, '');
  var n = parseFloat(s);
  return isNaN(n) ? null : n;
}

// "있음", "예", "Y", "true", "1" → true / 그 외("없음" 포함) → false
function parseBoolean(val) {
  if (val === null || val === undefined) return false;
  var s = String(val).trim().toLowerCase();
  return s === '있음' || s === '예' || s === 'y' || s === 'yes' || s === 'true' || s === '1';
}

// Date 객체 또는 날짜 문자열 → "YYYY-MM-DD"
function parseDateSafe(val) {
  if (!val) return null;
  try {
    var d = (val instanceof Date) ? val : new Date(val);
    if (isNaN(d.getTime())) return null;
    var yyyy = d.getFullYear();
    var mm   = String(d.getMonth() + 1).padStart(2, '0');
    var dd   = String(d.getDate()).padStart(2, '0');
    return yyyy + '-' + mm + '-' + dd;
  } catch (e) {
    return null;
  }
}

// AI 분석 결과 3개 필드를 consultation_memo로 합산
function buildMemo(org, amount, analysis) {
  var parts = [];
  if (org)      parts.push('[AI추천기관] ' + org);
  if (amount)   parts.push('[AI예상금액] ' + amount);
  if (analysis) parts.push('[AI분석] '    + analysis);
  return parts.length > 0 ? parts.join('\n') : null;
}

// ── 수동 테스트 함수 ─────────────────────────────────────────
// Apps Script 에디터에서 직접 실행하여 마지막 행으로 테스트
function testManual() {
  Logger.log('=== 수동 테스트 시작 (마지막 행) ===');
  onSheetChange({ changeType: 'INSERT_ROW' });
  Logger.log('=== 완료. 로그를 확인하세요 ===');
}
