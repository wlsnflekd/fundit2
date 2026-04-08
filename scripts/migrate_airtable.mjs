/**
 * migrate_airtable.mjs
 * Airtable CSV → Supabase customers 마이그레이션 스크립트
 *
 * 사용법:
 *   node scripts/migrate_airtable.mjs --dry-run   # 분석만 (INSERT 없음)
 *   node scripts/migrate_airtable.mjs --run        # 실제 INSERT (SUPABASE_SERVICE_KEY 필요)
 */

import { createClient } from '@supabase/supabase-js';
import Papa from 'papaparse';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// ─── 설정 ───────────────────────────────────────────────────────────────────
const SUPABASE_URL = 'https://ddivdcsierbngtuxtdyu.supabase.co';
const ANON_KEY = 'sb_publishable_VTfgbfTQGpLsWi6cjgrFvQ_OezMLa1C';
const WORKSPACE_ID = 'a1650b9e-31da-43e6-9179-17390d06f58c';
const CSV_PATH = path.join(ROOT, '고객DB-Grid view.csv');
const UNMATCHED_CSV_PATH = path.join(__dirname, 'migration_unmatched.csv');
const ERROR_LOG_PATH = path.join(__dirname, 'migration_errors.log');
const BATCH_SIZE = 50;

// ─── 담당자 매핑 (CSV 담당자 텍스트 → profiles uuid) ────────────────────────
// profiles 테이블 조회 결과 기반:
//   성장자금지원센터 → 40f308e7-088b-4bde-a7dd-18241d873054
//   박주형           → 462fc0c9-dbe9-459d-a25d-c1c7d5340da7
//   김동현           → 0a1b12b7-366b-412c-a1cc-a7837262be30
//   임성광           → cb7585e2-3844-496e-a146-28e61b237374
//   유진우           → d386a0e7-632e-40bd-8220-d6718558a415
const CONSULTANT_MAP = {
  '자금지원센터 성장': '40f308e7-088b-4bde-a7dd-18241d873054',
  '성장자금지원센터': '40f308e7-088b-4bde-a7dd-18241d873054',
  '성장': '40f308e7-088b-4bde-a7dd-18241d873054',
  '박주형': '462fc0c9-dbe9-459d-a25d-c1c7d5340da7',
  '김동현': '0a1b12b7-366b-412c-a1cc-a7837262be30',
  '임성광': 'cb7585e2-3844-496e-a146-28e61b237374',
  '임성광 임': 'cb7585e2-3844-496e-a146-28e61b237374',
  '유진우': 'd386a0e7-632e-40bd-8220-d6718558a415',
  '라타 올': 'd386a0e7-632e-40bd-8220-d6718558a415', // 유진우로 매핑
};

// ─── 모드 확인 ───────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const isRun = args.includes('--run');

if (!isDryRun && !isRun) {
  console.error('사용법: node scripts/migrate_airtable.mjs --dry-run | --run');
  process.exit(1);
}

// ─── Supabase 클라이언트 초기화 ──────────────────────────────────────────────
let supabase;
if (isRun) {
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;
  if (!serviceKey) {
    console.error('[오류] --run 모드에는 SUPABASE_SERVICE_KEY 환경변수가 필요합니다.');
    process.exit(1);
  }
  supabase = createClient(SUPABASE_URL, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  console.log('[모드] LIVE RUN — 실제 INSERT 실행');
} else {
  supabase = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  console.log('[모드] DRY RUN — 분석만 실행, INSERT 없음');
}

// ─── 유틸 함수 ───────────────────────────────────────────────────────────────

/** 날짜 파싱: YYYY.M.D / YYYY-MM-DD / YYYY.MM.DD → 'YYYY-MM-DD' or null */
function parseDate(raw) {
  if (!raw || !raw.trim()) return null;
  const s = raw.trim();

  // YYYY-MM-DD (이미 정규 형식)
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // YYYY.M.D or YYYY.MM.DD
  const m = s.match(/^(\d{4})\.(\d{1,2})\.(\d{1,2})/);
  if (m) {
    const yyyy = m[1];
    const mm = m[2].padStart(2, '0');
    const dd = m[3].padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  // YYMMDD (주민등록번호 앞 6자리 등)
  const m2 = s.match(/^(\d{2})(\d{2})(\d{2})$/);
  if (m2) {
    const yy = parseInt(m2[1]);
    const yyyy = yy >= 0 && yy <= 30 ? `20${m2[1]}` : `19${m2[1]}`;
    return `${yyyy}-${m2[2]}-${m2[3]}`;
  }

  return null; // 파싱 불가
}

/** 숫자 추출: '3천만원', '2억', '6천', '1억원가량', '최대한도' 등 */
function extractNumber(raw) {
  if (!raw || !raw.trim()) return null;
  const s = raw.trim();

  // 억/천 혼용 (예: '1억 2천', '2억원') → null (혼용은 명세상 null)
  if (/억.*천|천.*억/.test(s)) return null;

  // 억 단위 (예: '1억', '2억원가량')
  const okuMatch = s.match(/^(\d+(?:\.\d+)?)\s*억/);
  if (okuMatch) return Math.round(parseFloat(okuMatch[1]) * 1_0000_0000);

  // 천만원 단위 (예: '3천만원', '3천만')
  const chunMunMatch = s.match(/^(\d+(?:\.\d+)?)\s*천만/);
  if (chunMunMatch) return Math.round(parseFloat(chunMunMatch[1]) * 1_000_0000);

  // 천 단위 (만원 × 10000 적용) (예: '6천', '3천', '2천')
  const chunMatch = s.match(/^(\d+(?:\.\d+)?)\s*천/);
  if (chunMatch) return Math.round(parseFloat(chunMatch[1]) * 1_000 * 10_000);

  // 만원 단위 (예: '500만원', '3000만')
  const manMatch = s.match(/^(\d+(?:\.\d+)?)\s*만/);
  if (manMatch) return Math.round(parseFloat(manMatch[1]) * 10_000);

  // 순수 숫자
  const numMatch = s.match(/^(\d+(?:\.\d+)?)/);
  if (numMatch) return Math.round(parseFloat(numMatch[1]));

  return null;
}

/** 정수 추출 (직원수, 신용점수 등) */
function extractInt(raw) {
  if (!raw || !raw.trim()) return null;
  const s = raw.trim();

  // '3~5명' → null (범위)
  if (/~/.test(s)) return null;

  // '0명', '1인사업자' 등
  const match = s.match(/^(\d+)/);
  if (match) return parseInt(match[1]);

  return null;
}

/** 신용점수 파싱: KCB/NICE 분리 */
function parseCreditScore(raw) {
  if (!raw || !raw.trim()) return { credit_score: null, kcb_score: null, nice_score: null };
  const s = raw.trim();

  let kcb = null;
  let nice = null;

  // 패턴: "KCB 760 / NICE 750" 또는 "KCB760/NICE750"
  const kcbMatch = s.match(/KCB\s*(\d{3,})/i);
  const niceMatch = s.match(/NICE\s*(\d{3,})/i);

  if (kcbMatch) kcb = parseInt(kcbMatch[1]);
  if (niceMatch) nice = parseInt(niceMatch[1]);

  // "728 / nice 863" 패턴 (KCB 표기 없이 숫자만)
  if (!kcb && !nice) {
    const simpleMatch = s.match(/^(\d{3,})\s*[\/\-]\s*(?:nice\s*)?(\d{3,})/i);
    if (simpleMatch) {
      kcb = parseInt(simpleMatch[1]);
      nice = parseInt(simpleMatch[2]);
    } else {
      // 단일 숫자
      const single = s.match(/^(\d{3,})/);
      if (single) kcb = parseInt(single[1]);
    }
  }

  // credit_score: KCB 우선, 없으면 NICE
  const credit_score = kcb || nice || null;
  return { credit_score, kcb_score: kcb, nice_score: nice };
}

/** boolean 변환: '있음'=true, '없음'=false, 'x'/'X'=false, 빈값/날짜/숫자=null */
function parseBoolean(raw, colName) {
  if (!raw || !raw.trim()) return { value: null, warning: null };
  const s = raw.trim();

  if (s === '있음') return { value: true, warning: null };
  if (s === '없음') return { value: false, warning: null };
  if (s.toLowerCase() === 'x') return { value: false, warning: null };

  // 날짜 형식이면 null
  if (/^\d{4}[.\-]/.test(s)) return { value: null, warning: `날짜형식값 무시: [${colName}]="${s}"` };

  // 숫자 포함 내용 → 특수케이스
  if (/\d/.test(s) && colName !== '정책자금사용여부') {
    return { value: null, warning: `숫자형 값 무시: [${colName}]="${s}"` };
  }

  // 정책자금사용여부: '재단 2천 사용중', '3' 등 → 데이터 있으면 true
  if (colName === '정책자금사용여부') {
    if (s.includes('x') || s.toLowerCase() === 'x') return { value: false, warning: null };
    return { value: true, warning: `텍스트→true 변환: [${colName}]="${s}"` };
  }

  // 기타 텍스트 (워크아웃, 폐업 관련 등) → true로 처리 (있음의 의미)
  return { value: true, warning: `텍스트→true 변환: [${colName}]="${s}"` };
}

/** consultation_memo 조합 */
function buildMemo(row) {
  const sections = [
    { label: '상담내용', key: '상담내용' },
    { label: 'AI분석', key: 'AI분석' },
    { label: '상담기록', key: '상담기록' },
    { label: '간단메모', key: '간단메모' },
    { label: '추천상품1', key: '추천상품1' },
    { label: '추천상품2', key: '추천상품2' },
    { label: '가능성', key: '가능성' },
    { label: '판단근거', key: '판단근거' },
    { label: '주의사항', key: '주의사항' },
    { label: '필요서류', key: '필요서류' },
    { label: '매출상세', key: '매출 상세(월평균/전년도/전전년도 연매출' },
    { label: 'AI추천기관', key: 'AI추천기관' },
    { label: 'AI예상금액', key: 'AI예상금액' },
  ];

  const parts = sections
    .map(({ label, key }) => {
      const val = row[key];
      if (!val || !val.trim()) return null;
      return `[${label}]\n${val.trim()}`;
    })
    .filter(Boolean);

  return parts.length > 0 ? parts.join('\n\n') : null;
}

/** 전화번호 정규화: 하이픈 제거, 숫자만 */
function normalizePhone(raw) {
  if (!raw || !raw.trim()) return null;
  return raw.trim().replace(/[^0-9]/g, '') || null;
}

/** Tags 파싱: 쉼표 구분 배열 */
function parseTags(raw) {
  if (!raw || !raw.trim()) return null;
  const arr = raw.split(',').map(t => t.trim()).filter(Boolean);
  return arr.length > 0 ? arr : null;
}

// ─── CSV 파싱 ────────────────────────────────────────────────────────────────
const buf = fs.readFileSync(CSV_PATH);
const csvText = buf.toString('utf8').replace(/^\uFEFF/, '');
const parsed = Papa.parse(csvText, { header: true, skipEmptyLines: false });
const allRows = parsed.data.filter(r => r['번호'] && r['번호'].trim());

console.log(`\nCSV 총 행수 (헤더 제외): ${allRows.length}`);

// ─── 기존 phone 목록 조회 (중복 체크용) ─────────────────────────────────────
let existingPhones = new Set();
if (isRun) {
  const { data: existing, error } = await supabase
    .from('customers')
    .select('phone')
    .eq('workspace_id', WORKSPACE_ID)
    .not('phone', 'is', null);
  if (error) {
    console.error('[오류] 기존 customers 조회 실패:', error.message);
    process.exit(1);
  }
  existingPhones = new Set(existing.map(r => r.phone).filter(Boolean));
}

// ─── 행 변환 ────────────────────────────────────────────────────────────────
const errorLog = [];
const unmatchedRows = [];
const validRows = [];

let statTotal = 0;
let statNoPhone = 0;
let statDuplicate = 0;
let statConsultantUnmapped = 0;
let statDateError = 0;
let statBoolError = 0;

for (const row of allRows) {
  statTotal++;
  const rowNo = row['번호']?.trim();
  const warnings = [];
  const errors = [];

  // ── 1. phone ──
  const phone = normalizePhone(row['연락처']);
  if (!phone) {
    statNoPhone++;
    warnings.push('phone 없음');
  }

  // ── 2. 중복 체크 (--run 시에만) ──
  if (isRun && phone && existingPhones.has(phone)) {
    statDuplicate++;
    unmatchedRows.push({ ...row, _reason: `중복: phone=${phone}` });
    continue;
  }

  // ── 3. company ──
  const company = row['업체명']?.trim() || row['이름']?.trim() || '이름없음';

  // ── 4. consultant ──
  const consultantRaw = row['담당자']?.trim();
  let consultant = null;
  if (consultantRaw) {
    if (consultantRaw in CONSULTANT_MAP) {
      consultant = CONSULTANT_MAP[consultantRaw];
      if (consultant === null) {
        statConsultantUnmapped++;
        warnings.push(`담당자 매핑 실패: "${consultantRaw}"`);
      }
    } else {
      // 부분 매칭 시도
      const found = Object.keys(CONSULTANT_MAP).find(k => consultantRaw.includes(k) || k.includes(consultantRaw));
      if (found) {
        consultant = CONSULTANT_MAP[found];
        if (consultant === null) {
          statConsultantUnmapped++;
          warnings.push(`담당자 부분매칭→null: "${consultantRaw}"`);
        }
      } else {
        statConsultantUnmapped++;
        warnings.push(`담당자 매핑 실패 (unknown): "${consultantRaw}"`);
      }
    }
  }

  // ── 5. 날짜 파싱 ──
  const receivedDate = parseDate(row['접수일']);
  if (row['접수일']?.trim() && !receivedDate) {
    statDateError++;
    warnings.push(`접수일 파싱 실패: "${row['접수일']}"`);
  }

  const birthDate = parseDate(row['생년월일']);
  if (row['생년월일']?.trim() && !birthDate) {
    statDateError++;
    warnings.push(`생년월일 파싱 실패: "${row['생년월일']}"`);
  }

  const businessRegDate = parseDate(row['사업자등록일']);
  if (row['사업자등록일']?.trim() && !businessRegDate) {
    statDateError++;
    warnings.push(`사업자등록일 파싱 실패: "${row['사업자등록일']}"`);
  }

  // ── 6. boolean 파싱 ──
  const taxResult = parseBoolean(row['세급체납여부'], '세급체납여부');
  if (taxResult.warning) { statBoolError++; warnings.push(taxResult.warning); }

  const overdueResult = parseBoolean(row['연체이력'], '연체이력');
  if (overdueResult.warning) { statBoolError++; warnings.push(overdueResult.warning); }

  const rehabResult = parseBoolean(row['회파복이력(몇회납부인지 체크)'], '회파복이력');
  if (rehabResult.warning) { statBoolError++; warnings.push(rehabResult.warning); }

  const smartResult = parseBoolean(row['스마트기기 이용여부'], '스마트기기 이용여부');
  if (smartResult.warning) { statBoolError++; warnings.push(smartResult.warning); }

  const closureResult = parseBoolean(row['폐업이력'], '폐업이력');
  if (closureResult.warning) { statBoolError++; warnings.push(closureResult.warning); }

  const policyFundResult = parseBoolean(row['정책자금사용여부'], '정책자금사용여부');
  if (policyFundResult.warning) { statBoolError++; warnings.push(policyFundResult.warning); }

  const exporterResult = parseBoolean(row['수출여부'], '수출여부');
  if (exporterResult.warning) { statBoolError++; warnings.push(exporterResult.warning); }

  // ── 7. 신용점수 ──
  const creditScores = parseCreditScore(row['신용점수']);

  // ── 8. 숫자 파싱 ──
  const existingLoan = extractNumber(row['기대출']);
  const requiredFunds = extractNumber(row['필요자금']);
  const contractAmount = extractNumber(row['계약금/수수료']);
  const employeeCount = extractInt(row['상시근로자수']);

  // ── 9. consultation_memo ──
  const consultationMemo = buildMemo(row);

  // ── 10. status ──
  const statusRaw = row['상태']?.trim();
  const status = statusRaw || '신규';

  // ── 오류 있으면 unmatched에도 추가 ──
  if (warnings.length > 0) {
    errorLog.push(`[번호 ${rowNo}] ${company} | ${warnings.join(' | ')}`);
    if (warnings.some(w => w.includes('매핑 실패'))) {
      unmatchedRows.push({ ...row, _reason: warnings.join('; ') });
    }
  }

  // ── 최종 레코드 구성 ──
  const record = {
    workspace_id: WORKSPACE_ID,
    company,
    ceo: row['이름']?.trim() || null,
    phone,
    industry: row['업종']?.trim() || null,
    business_age: row['업력']?.trim() || null,
    monthly_revenue: row['매출']?.trim() || null,
    region: row['지역']?.trim() || null,
    lead_source: row['유입경로']?.trim() || null,
    received_date: receivedDate,
    received_month: row['접수월']?.trim() || null,
    status,
    consultant,
    business_type: row['사업자형태']?.trim() || null,
    tags: parseTags(row['Tags']),
    tax_delinquent: taxResult.value !== null ? taxResult.value : false,
    overdue_history: overdueResult.value,
    rehabilitation: rehabResult.value,
    smart_device: smartResult.value,
    closure_history: closureResult.value,
    policy_fund_usage: policyFundResult.value,
    policy_fund_memo: (policyFundResult.value === true && policyFundResult.warning)
      ? (row['정책자금사용여부']?.trim() || null)
      : null,
    is_exporter: exporterResult.value,
    birth_date: birthDate,
    business_reg_date: businessRegDate,
    employee_count: employeeCount,
    existing_loan: existingLoan,
    required_funds: requiredFunds,
    contract_amount: contractAmount,
    consultation_memo: consultationMemo,
    credit_score: creditScores.credit_score,
    kcb_score: creditScores.kcb_score,
    nice_score: creditScores.nice_score,
    resident_id_front: row['주민등록번호']?.trim() || null,
    aippin_id: row['아이핀ID']?.trim() || null,
    aippin_pw: row['아이핀PW']?.trim() || null,
    aippin_2fa: row['아이핀2차']?.trim() || null,
    sbiz_id: row['소진공ID']?.trim() || null,
    sbiz_pw: row['소진공PW']?.trim() || null,
    business_reg_no: row['사업자등록번호']?.trim() || null,
    customer_no: parseInt(rowNo) || null,
    pool: false,
    score: 0,
  };

  validRows.push(record);
}

// ─── 통계 출력 ───────────────────────────────────────────────────────────────
console.log('\n====== 마이그레이션 분석 결과 ======');
console.log(`총 행수:           ${statTotal}`);
console.log(`유효 행수:         ${validRows.length}`);
console.log(`phone 없음:        ${statNoPhone}`);
console.log(`중복 (phone):      ${statDuplicate}`);
console.log(`담당자 매핑 실패:  ${statConsultantUnmapped}`);
console.log(`날짜 파싱 이슈:    ${statDateError}`);
console.log(`boolean 변환 주의: ${statBoolError}`);
console.log(`INSERT 예정:       ${isDryRun ? validRows.length + ' (dry-run, 실행 안 함)' : validRows.length}`);

// ─── 샘플 3건 출력 ───────────────────────────────────────────────────────────
console.log('\n====== 샘플 3건 (변환 후) ======');
validRows.slice(0, 3).forEach((r, i) => {
  console.log(`\n[${i + 1}] 번호=${r.customer_no} company="${r.company}" phone="${r.phone}" status="${r.status}"`);
  console.log(`     consultant=${r.consultant} industry="${r.industry}" region="${r.region}"`);
  console.log(`     received_date=${r.received_date} credit_score=${r.credit_score} kcb=${r.kcb_score} nice=${r.nice_score}`);
  console.log(`     tax_delinquent=${r.tax_delinquent} overdue=${r.overdue_history} rehab=${r.rehabilitation}`);
  console.log(`     existing_loan=${r.existing_loan} required_funds=${r.required_funds} employee_count=${r.employee_count}`);
  console.log(`     consultation_memo=${r.consultation_memo ? r.consultation_memo.substring(0, 60) + '...' : null}`);
});

// ─── unmatched CSV 출력 ──────────────────────────────────────────────────────
if (unmatchedRows.length > 0) {
  const unmatchedCsv = Papa.unparse(unmatchedRows);
  fs.writeFileSync(UNMATCHED_CSV_PATH, unmatchedCsv, 'utf8');
  console.log(`\nunmatched ${unmatchedRows.length}건 → ${UNMATCHED_CSV_PATH}`);
}

// ─── 에러 로그 출력 ──────────────────────────────────────────────────────────
if (errorLog.length > 0) {
  fs.writeFileSync(ERROR_LOG_PATH, errorLog.join('\n'), 'utf8');
  console.log(`에러 로그 ${errorLog.length}건 → ${ERROR_LOG_PATH}`);
}

// ─── DRY RUN 종료 ────────────────────────────────────────────────────────────
if (isDryRun) {
  console.log('\n[DRY RUN 완료] INSERT 실행 없음.');
  console.log('실제 실행 시: SUPABASE_SERVICE_KEY=<key> node scripts/migrate_airtable.mjs --run');
  process.exit(0);
}

// ─── 실제 INSERT (--run) ─────────────────────────────────────────────────────
console.log(`\n[RUN] ${validRows.length}건 INSERT 시작 (배치 ${BATCH_SIZE}건씩)...`);

let insertOk = 0;
let insertFail = 0;
const insertErrors = [];

// customer_no 기준 오름차순 정렬
validRows.sort((a, b) => (a.customer_no || 0) - (b.customer_no || 0));

for (let i = 0; i < validRows.length; i += BATCH_SIZE) {
  const batch = validRows.slice(i, i + BATCH_SIZE);
  const batchNo = Math.floor(i / BATCH_SIZE) + 1;
  process.stdout.write(`  배치 ${batchNo} (${i + 1}~${Math.min(i + BATCH_SIZE, validRows.length)})... `);

  const { error } = await supabase.from('customers').insert(batch);

  if (!error) {
    insertOk += batch.length;
    console.log('OK');
  } else {
    console.log(`FAIL (${error.message}) — 1건씩 재시도`);
    insertErrors.push(`[배치 ${batchNo}] ${error.message}`);

    // 1건씩 재시도
    for (const record of batch) {
      const { error: singleError } = await supabase.from('customers').insert([record]);
      if (!singleError) {
        insertOk++;
      } else {
        insertFail++;
        const msg = `[번호 ${record.customer_no}] ${record.company} | ${singleError.message}`;
        insertErrors.push(msg);
        unmatchedRows.push({ customer_no: record.customer_no, company: record.company, _reason: singleError.message });
      }
    }
  }
}

// 최종 결과
console.log('\n====== INSERT 결과 ======');
console.log(`성공: ${insertOk}건`);
console.log(`실패: ${insertFail}건`);

if (insertErrors.length > 0) {
  fs.appendFileSync(ERROR_LOG_PATH, '\n\n[INSERT 오류]\n' + insertErrors.join('\n'), 'utf8');
  console.log(`INSERT 오류 → ${ERROR_LOG_PATH}`);
}

if (unmatchedRows.length > 0) {
  const unmatchedCsv2 = Papa.unparse(unmatchedRows);
  fs.writeFileSync(UNMATCHED_CSV_PATH, unmatchedCsv2, 'utf8');
  console.log(`unmatched/실패 ${unmatchedRows.length}건 → ${UNMATCHED_CSV_PATH}`);
}

console.log('\n[완료]');
