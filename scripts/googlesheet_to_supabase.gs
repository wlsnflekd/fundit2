// ============================================================
// FUNDIT — 구글시트 → Supabase 연동 [통합 완성본]
// 최종 수정: 2026-10-16 (국세체납 3단계: 있음/없음/빈칸=미확인)
//
// [응답 판별 — 0013 이후]
// submit_customer_form RPC는 JSON을 반환한다.
//   - {"status":"created"}          → 신규 등록 (시트 ✅)
//   - {"status":"duplicate"}        → 재문의, 펀딧에 중복 카드 새로 생성 (시트 🔁)
//   - {"status":"recent_duplicate"} → 10분 내 재유입, 카드 미생성 (시트 🔁)
//
// [2026-10-16]
// 국세체납여부: parseBoolean → parseTriState
//   있음 → true / 없음 → false / 빈칸·판별불가 → null(미확인)
// 필요자금: AI예상금액을 더 이상 required_funds에 넣지 않음 (null)
//   "1,500만원5억원" 같은 범위 문자열이 숫자로 이어 붙어 잘못 저장되던 문제
//
// [시트 구성]
// - 종합시트 : 자동 전송 (onSheetChange 트리거), P열(16) 전송여부
// - 당근광고 : 메뉴 버튼 일괄 전송, G열(7) 전송여부, H열(8) 비고
//
// [설정]
// 프로젝트 설정(⚙️) → 스크립트 속성
//   - SUPABASE_URL : https://ddivdcsierbngtuxtdyu.supabase.co
//   - SUPABASE_KEY : (ANON KEY)
// 트리거: onSheetChange / 스프레드시트에서 / 변경 시(onChange)
// ============================================================


// ── 시트 컬럼 인덱스 정의 (0-based, 종합시트) ────────────────
var COL = {
  제출일시:      0,
  유입채널:      1,
  업체명:        2,
  전화번호:      3,
  사업자번호:    4,
  사업자상태:    5,
  사업자유형:    6,
  업종:          7,
  사업운영기간:  8,
  월평균매출:    9,
  지역:          10,
  국세체납여부:  11,
  AI추천기관:    12,
  AI예상금액:    13,
  AI분석결과:    14,
  전송여부:      15,  // P열 (16번째)
};

// ── 워크스페이스 ID ─────────────────────────────────────────
var WORKSPACE_ID = 'a1650b9e-31da-43e6-9179-17390d06f58c';


// ============================================================
// 공통 — Supabase RPC 호출 및 결과 판별
// 반환: { status: 'success' | 'duplicate' | 'error', id, message }
// ============================================================
function callSubmitRpc(rpcPayload) {
  var props = PropertiesService.getScriptProperties();
  var url   = props.getProperty('SUPABASE_URL')
              || 'https://ddivdcsierbngtuxtdyu.supabase.co';
  var key   = props.getProperty('SUPABASE_KEY')
              || 'sb_publishable_VTfgbfTQGpLsWi6cjgrFvQ_OezMLa1C';

  var response = UrlFetchApp.fetch(url + '/rest/v1/rpc/submit_customer_form', {
    method:      'POST',
    contentType: 'application/json',
    headers: {
      'apikey':        key,
      'Authorization': 'Bearer ' + key,
    },
    payload:            JSON.stringify(rpcPayload),
    muteHttpExceptions: true,
  });

  var code = response.getResponseCode();
  var body = response.getContentText();

  // HTTP 자체 실패
  if (code !== 200) {
    return { status: 'error', message: 'HTTP ' + code + ' — ' + body };
  }

  // 200: body = {"id": "...", "status": "created"|"duplicate"|"recent_duplicate", "duplicate_count": n}
  var res;
  try {
    res = JSON.parse(String(body).trim());
  } catch (e) {
    return { status: 'error', message: '응답 파싱 실패: ' + body };
  }

  if (res && res.status === 'created') {
    return { status: 'success', id: res.id };
  }
  if (res && res.status === 'duplicate') {
    return { status: 'duplicate', id: res.id, message: '재문의 ' + res.duplicate_count + '회차 (새 카드 생성)' };
  }
  if (res && res.status === 'recent_duplicate') {
    return { status: 'duplicate', id: res.id, message: '10분 내 재유입 (카드 미생성)' };
  }
  return { status: 'error', message: '알 수 없는 응답: ' + body };
}


// ============================================================
// 종합시트 — 자동 전송 (onChange 트리거)
// ============================================================
function onSheetChange(e) {
  if (e && e.changeType !== 'INSERT_ROW') return;

  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet()
                               .getSheetByName('종합시트');
    if (!sheet) {
      Logger.log('[ERROR] "종합시트" 시트를 찾을 수 없습니다.');
      return;
    }

    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return;

    var numCols = Math.max(sheet.getLastColumn(), 16);

    // 중복 방지: P열(전송여부) 확인
    var sentFlag = sheet.getRange(lastRow, 16).getValue();
    if (sentFlag && String(sentFlag).trim() !== '') {
      Logger.log('[SKIP] 이미 처리된 행 ' + lastRow + ': ' + sentFlag);
      return;
    }

    var row = sheet.getRange(lastRow, 1, 1, numCols).getValues()[0];

    if (!row[COL.업체명] || String(row[COL.업체명]).trim() === '') {
      Logger.log('[SKIP] 빈 행 또는 업체명 없음 (행 ' + lastRow + ')');
      return;
    }

    if (!row[COL.전화번호] || String(row[COL.전화번호]).trim() === '') {
      Logger.log('[SKIP] 전화번호 없음 (행 ' + lastRow + ')');
      return;
    }

    var customer  = buildCustomerPayload(row);
    var result    = insertToSupabase(customer);
    var timestamp = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm');

    if (result.status === 'success') {
      sheet.getRange(lastRow, 16).setValue('✅ ' + timestamp);
      Logger.log('[OK] 신규 등록: ' + customer.company + ' (행 ' + lastRow + ')');

    } else if (result.status === 'duplicate') {
      sheet.getRange(lastRow, 16).setValue('🔁 ' + timestamp + ' 중복');
      Logger.log('[DUP] 기존 고객: ' + customer.company + ' (행 ' + lastRow + ')');

    } else {
      sheet.getRange(lastRow, 16).setValue('❌ 오류');
      Logger.log('[ERROR] ' + result.message);
      sendErrorAlert(customer.company, result.message);
    }

  } catch (err) {
    Logger.log('[EXCEPTION] ' + err.toString());
    sendErrorAlert('알 수 없음', err.toString());
  }
}


// ── Supabase INSERT 페이로드 생성 ───────────────────────────
function buildCustomerPayload(row) {
  var company       = cleanString(row[COL.업체명]);
  var phone         = cleanString(row[COL.전화번호]);
  var leadSource    = cleanString(row[COL.유입채널]);
  var businessType  = cleanString(row[COL.사업자유형]);
  var industry      = cleanString(row[COL.업종]);
  var region        = cleanString(row[COL.지역]);
  var businessAge   = cleanString(row[COL.사업운영기간]);
  var monthlyRev    = cleanString(row[COL.월평균매출]);
  var receivedDate  = parseDateSafe(row[COL.제출일시]);

  // 국세체납: 있음/없음/빈칸(미확인) 3단계
  var taxDelinquent = parseTriState(row[COL.국세체납여부]);

  var bizNum    = cleanString(row[COL.사업자번호]);
  var bizStatus = cleanString(row[COL.사업자상태]);

  var tags = [];
  if (bizStatus) tags.push('사업자상태:' + bizStatus);

  var aiOrg      = cleanString(row[COL.AI추천기관]);
  var aiAmount   = cleanString(row[COL.AI예상금액]);
  var aiAnalysis = cleanString(row[COL.AI분석결과]);
  var memo = buildMemo(aiOrg, aiAmount, aiAnalysis);

  // 필요자금은 상담 시 직원이 직접 입력 (AI예상금액 범위 문자열은 숫자로 변환 불가)
  // AI예상금액 원문은 consultation_memo의 [AI예상금액] 줄에 그대로 남는다.
  var requiredFunds = null;

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
    business_reg_no:   bizNum,
    status:            '신규',
    score:             0,
    pool:              false,
  };
}


// ── 종합시트용 RPC 호출 래퍼 ────────────────────────────────
function insertToSupabase(payload) {
  var result = callSubmitRpc({
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
    p_business_reg_no:   payload.business_reg_no,
  });

  return {
    success:   result.status === 'success',
    duplicate: result.status === 'duplicate',
    status:    result.status,
    id:        result.id,
    message:   result.message,
  };
}


// ── 에러 알림 이메일 ────────────────────────────────────────
function sendErrorAlert(company, message) {
  var email   = Session.getEffectiveUser().getEmail();
  var subject = '[FUNDIT] 고객사 등록 실패: ' + company;
  var body    = '고객사: ' + company + '\n\n오류:\n' + message;
  MailApp.sendEmail(email, subject, body);
}


// ============================================================
// 유틸리티 함수
// ============================================================

function cleanString(val) {
  if (val === null || val === undefined) return null;
  var s = String(val).trim();
  return s === '' ? null : s;
}

function parseNumericSafe(val) {
  if (val === null || val === undefined || val === '') return null;
  var s = String(val).replace(/,/g, '').trim();
  if (s.indexOf('만') !== -1) {
    s = s.replace(/[^0-9.]/g, '');
    var n = parseFloat(s);
    return isNaN(n) ? null : Math.round(n * 10000);
  }
  s = s.replace(/[^0-9.]/g, '');
  var n = parseFloat(s);
  return isNaN(n) ? null : n;
}

function parseBoolean(val) {
  if (val === null || val === undefined) return false;
  var s = String(val).trim().toLowerCase();
  return s === '있음' || s === '예' || s === 'y' || s === 'yes' || s === 'true' || s === '1';
}

// 3단계: 있음 → true, 없음 → false, 빈칸·그 외 → null(미확인)
function parseTriState(val) {
  if (val === null || val === undefined) return null;
  var s = String(val).trim().toLowerCase();
  if (s === '있음' || s === '예' || s === 'y' || s === 'yes' || s === 'true' || s === '1') return true;
  if (s === '없음' || s === '아니오' || s === 'n' || s === 'no' || s === 'false' || s === '0') return false;
  return null;
}

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

function buildMemo(org, amount, analysis) {
  var parts = [];
  if (org)      parts.push('[AI추천기관] ' + org);
  if (amount)   parts.push('[AI예상금액] ' + amount);
  if (analysis) parts.push('[AI분석] '    + analysis);
  return parts.length > 0 ? parts.join('\n') : null;
}

function normalizePhone(phone) {
  if (!phone) return null;
  var p = String(phone).replace(/[^0-9]/g, '');
  if (p.startsWith('10')) p = '0' + p;
  if (p.length === 10 || p.length === 11) {
    return p.replace(/^(\d{3})(\d{3,4})(\d{4})$/, '$1-$2-$3');
  }
  return String(phone).trim();
}


// ── 수동 테스트 함수 (종합시트 마지막 행) ────────────────────
function testManual() {
  Logger.log('=== 수동 테스트 시작 (마지막 행) ===');
  onSheetChange({ changeType: 'INSERT_ROW' });
  Logger.log('=== 완료. 로그를 확인하세요 ===');
}


// ============================================================
// 당근광고 → FUNDIT2 일괄 전송
// 시트탭: 당근광고
// 컬럼: A=접수일시 B=이름 C=연락처 D=사업자유형 E=업종 F=사업운영기간
//       G=전송여부 H=비고
// 실행: 상단 메뉴 [📣 당근광고 전송] → [펀딧으로 전송]
// ============================================================
function sendDanggeunLeads() {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('당근광고');

  if (!sheet) {
    SpreadsheetApp.getUi().alert('⚠️ "당근광고" 시트를 찾을 수 없습니다.');
    return;
  }

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    SpreadsheetApp.getUi().alert('전송할 데이터가 없습니다.');
    return;
  }

  var data  = sheet.getRange(2, 1, lastRow - 1, 8).getValues();
  var today = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd');

  var successCount   = 0;
  var duplicateCount = 0;
  var skipCount      = 0;
  var errorCount     = 0;
  var errors         = [];

  data.forEach(function(row, i) {
    var actualRow = i + 2;

    // 이미 처리된 행 스킵
    if (row[6] && String(row[6]).trim() !== '') {
      skipCount++;
      return;
    }

    var phone = normalizePhone(row[2]);
    if (!phone) {
      sheet.getRange(actualRow, 7).setValue('❌ ' + today + ' 실패');
      sheet.getRange(actualRow, 8).setValue('연락처 없음');
      errors.push(actualRow + '행: 연락처 없음');
      errorCount++;
      return;
    }

    var company = cleanString(row[1]) || '(이름 없음)';

    var result = callSubmitRpc({
      p_workspace_id:  WORKSPACE_ID,
      p_company:       company,
      p_phone:         phone,
      p_lead_source:   '당근',
      p_business_type: cleanString(row[3]),
      p_industry:      cleanString(row[4]),
      p_business_age:  cleanString(row[5]),
      p_received_date: parseDateSafe(row[0]),
    });

    if (result.status === 'success') {
      sheet.getRange(actualRow, 7).setValue('✅ ' + today + ' 성공');
      sheet.getRange(actualRow, 8).setValue('');
      successCount++;

    } else if (result.status === 'duplicate') {
      sheet.getRange(actualRow, 7).setValue('🔁 ' + today + ' 중복(기존고객)');
      sheet.getRange(actualRow, 8).setValue(result.message);
      duplicateCount++;

    } else {
      sheet.getRange(actualRow, 7).setValue('❌ ' + today + ' 실패');
      sheet.getRange(actualRow, 8).setValue(result.message);
      errors.push(actualRow + '행 (' + company + '): ' + result.message);
      errorCount++;
    }

    Utilities.sleep(200);
  });

  var msg = '✅ 신규 등록: ' + successCount + '건\n'
          + '🔁 중복(기존고객): ' + duplicateCount + '건\n'
          + '⏭️ 기처리 스킵: ' + skipCount + '건';

  if (errorCount > 0) {
    msg += '\n❌ 오류: ' + errorCount + '건\n\n' + errors.join('\n');
  }

  SpreadsheetApp.getUi().alert(msg);
}


// ============================================================
// 종합시트 — 미전송 행 일괄 재전송
// ============================================================
function resendAll() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet()
                             .getSheetByName('종합시트');
  if (!sheet) { Logger.log('[ERROR] 종합시트 없음'); return; }

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) { Logger.log('[ERROR] 데이터 없음'); return; }

  var numCols = Math.max(sheet.getLastColumn(), 16);
  var data    = sheet.getRange(2, 1, lastRow - 1, numCols).getValues();

  var successCount   = 0;
  var duplicateCount = 0;
  var skipCount      = 0;
  var errorCount     = 0;

  data.forEach(function(row, i) {
    var actualRow = i + 2;

    if (row[15] && String(row[15]).trim() !== '') { skipCount++; return; }
    if (!row[COL.업체명] || !row[COL.전화번호])    { skipCount++; return; }

    var customer  = buildCustomerPayload(row);
    var result    = insertToSupabase(customer);
    var timestamp = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm');

    if (result.status === 'success') {
      sheet.getRange(actualRow, 16).setValue('✅ ' + timestamp);
      successCount++;

    } else if (result.status === 'duplicate') {
      sheet.getRange(actualRow, 16).setValue('🔁 ' + timestamp + ' 중복');
      duplicateCount++;

    } else {
      sheet.getRange(actualRow, 16).setValue('❌ 오류');
      errorCount++;
      Logger.log('[ERROR] ' + actualRow + '행: ' + result.message);
    }

    Utilities.sleep(300);
  });

  SpreadsheetApp.getUi().alert(
    '✅ 신규 등록: ' + successCount + '건\n'
    + '🔁 중복(기존고객): ' + duplicateCount + '건\n'
    + '⏭️ 스킵: ' + skipCount + '건\n'
    + '❌ 오류: ' + errorCount + '건'
  );
}


// ============================================================
// 메뉴 등록
// ============================================================
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('📣 당근광고 전송')
    .addItem('펀딧으로 전송', 'sendDanggeunLeads')
    .addToUi();
}