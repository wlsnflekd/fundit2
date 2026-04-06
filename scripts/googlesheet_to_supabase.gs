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
  국세체납여부:  11,  // L: 국세체납여부
  AI추천기관:    12,  // M: AI추천기관
  AI예상금액:    13,  // N: AI예상금액
  AI분석결과:    14,  // O: AI분석결과
};

// ── 워크스페이스 ID ─────────────────────────────────────────
var WORKSPACE_ID = 'a1650b9e-31da-43e6-9179-17390d06f58c';

// ── 메인 트리거 함수 ────────────────────────────────────────
function onFormSubmit(e) {
  try {
    var row = getRowFromEvent(e);
    if (!row) {
      Logger.log('[ERROR] 행 데이터를 가져올 수 없습니다.');
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

// ── 이벤트에서 행 배열 추출 ─────────────────────────────────
function getRowFromEvent(e) {
  // 폼 제출 이벤트 → e.values 배열
  if (e && e.values) {
    return e.values;
  }

  // 수동 테스트 실행 시 → 시트에서 마지막 행 읽기
  var sheet = SpreadsheetApp.getActiveSpreadsheet()
                             .getSheetByName('종합시트');
  if (!sheet) {
    Logger.log('[ERROR] "종합시트" 시트를 찾을 수 없습니다.');
    return null;
  }

  var lastRow  = sheet.getLastRow();
  var numCols  = sheet.getLastColumn();
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
  var businessAge   = parseIntSafe(row[COL.사업운영기간]);
  var monthlyRev    = parseNumericSafe(row[COL.월평균매출]);
  var taxDelinquent = parseBoolean(row[COL.국세체납여부]);
  var receivedDate  = parseDateSafe(row[COL.제출일시]);

  // 사업자번호 + 사업자상태 → tags 배열로 저장
  var tags = [];
  var bizNum    = cleanString(row[COL.사업자번호]);
  var bizStatus = cleanString(row[COL.사업자상태]);
  if (bizNum)    tags.push('사업자:' + bizNum);
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
    tax_delinquent:    taxDelinquent,
    required_funds:    requiredFunds,
    consultation_memo: memo,
    tags:              tags.length > 0 ? tags : null,
    received_date:     receivedDate,
    status:            '신청예정',   // 초기 CRM 상태
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
    p_tax_delinquent:    payload.tax_delinquent,
    p_required_funds:    payload.required_funds,
    p_consultation_memo: payload.consultation_memo,
    p_tags:              payload.tags,
    p_received_date:     payload.received_date,
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

// "12개월", "2년", "24" 등에서 정수 추출
function parseIntSafe(val) {
  if (val === null || val === undefined || val === '') return null;
  var s = String(val).replace(/[^0-9]/g, '');
  if (s === '') return null;
  var n = parseInt(s, 10);
  return isNaN(n) ? null : n;
}

// "500만원", "1,200,000" 등에서 숫자 추출 (만원 단위 → 원으로 변환)
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

// "예", "Y", "true", "1" → true / 그 외 → false
function parseBoolean(val) {
  if (val === null || val === undefined) return false;
  var s = String(val).trim().toLowerCase();
  return s === '예' || s === 'y' || s === 'yes' || s === 'true' || s === '1';
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
  onFormSubmit(null);
  Logger.log('=== 완료. 로그를 확인하세요 ===');
}
