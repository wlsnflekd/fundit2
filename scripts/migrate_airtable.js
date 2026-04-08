/**
 * FUNDIT — 에어테이블 CSV → Supabase customers 마이그레이션 스크립트
 *
 * 실행 방법:
 *   node scripts/migrate_airtable.js --dry-run   # 실제 INSERT 없이 결과만 출력
 *   node scripts/migrate_airtable.js --run        # 실제 INSERT 실행
 *
 * 사전 설치:
 *   npm install papaparse @supabase/supabase-js
 *
 * ⚠️ --run 실행 시 Service Role Key 필요 (RLS 우회)
 *   Supabase 대시보드 → Project Settings → API → service_role key
 *   환경변수: SUPABASE_SERVICE_KEY=xxx node scripts/migrate_airtable.js --run
 */

import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Papa from 'papaparse';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ──────────────────────────────────────────────
// 설정
// ──────────────────────────────────────────────

const SUPABASE_URL     = 'https://ddivdcsierbngtuxtdyu.supabase.co';
const ANON_KEY         = 'sb_publishable_VTfgbfTQGpLsWi6cjgrFvQ_OezMLa1C';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_KEY || '';

const WORKSPACE_ID   = 'a1650b9e-31da-43e6-9179-17390d06f58c';
const CSV_PATH       = path.resolve(__dirname, '../고객DB-Grid view.csv');
const ERROR_LOG_PATH = path.resolve(__dirname, 'migration_errors.log');
const BATCH_SIZE     = 50;

// ──────────────────────────────────────────────
// 담당자 UUID 매핑
// ──────────────────────────────────────────────

const CONSULTANT_MAP = {
  '박주형':    '462fc0c9-b946-4a66-9625-c41c97274782',
  '김동현':    '0a1b12b7-ca18-49d5-8892-e86b54a76574',
  '임성광':    'cb7585e2-f3d7-4f56-b2c6-d5c63d15e3db',
  '임성광 임': 'cb7585e2-f3d7-4f56-b2c6-d5c63d15e3db',
  '유진우':    'd386a0e7-632e-40bd-8220-d6718558a415',
};

// ──────────────────────────────────────────────
// 유틸 함수
// ──────────────────────────────────────────────

function parseDate(raw) {
  if (!raw || !raw.trim()) return null;
  const s = raw.trim();
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2,'0')}-${iso[3].padStart(2,'0')}`;
  const dot = s.match(/^(\d{4})\.(\d{1,2})\.(\d{1,2})/);
  if (dot) return `${dot[1]}-${dot[2].padStart(2,'0')}-${dot[3].padStart(2,'0')}`;
  return null;
}

function extractNumber(raw) {
  if (!raw || !raw.trim()) return null;
  const m = raw.replace(/,/g, '').match(/-?\d+(\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
}

function parseExistingLoan(raw) {
  if (!raw || !raw.trim()) return null;
  const s = raw.trim();
  if (/억|천/.test(s)) return null;
  const num = extractNumber(s);
  if (num === null) return null;
  return /만원?/.test(s) ? num * 10000 : num;
}

function parseBool(raw) {
  if (!raw || !raw.trim()) return null;
  const s = raw.trim();
  if (s === '있음') return true;
  if (s === '없음') return false;
  return null;
}

function mapConsultant(raw) {
  if (!raw || !raw.trim()) return null;
  const s = raw.trim();
  if (s.includes('자금지원센터') || s.includes('성장')) return null;
  if (s.length > 20) return null;
  return CONSULTANT_MAP[s] || null;
}

function buildMemo(row) {
  const sections = [
    ['상담내용', row['상담내용']],
    ['AI분석',   row['AI분석']],
    ['추천상품1', row['추천상품1']],
    ['추천상품2', row['추천상품2']],
    ['가능성',   row['가능성']],
    ['판단근거', row['판단근거']],
  ];
  const parts = sections
    .filter(([, v]) => v && v.trim())
    .map(([k, v]) => `[${k}]\n${v.trim()}`);
  return parts.length > 0 ? parts.join('\n\n') : null;
}

function parseTags(raw) {
  if (!raw || !raw.trim()) return [];
  return raw.split(',').map(t => t.trim()).filter(Boolean);
}

// ──────────────────────────────────────────────
// CSV 행 → DB 레코드 변환
// ──────────────────────────────────────────────

function mapRow(row) {
  const company    = (row['업체명'] || '').trim() || (row['이름'] || '').trim() || '(이름없음)';
  const customerNo = parseInt(row['번호'] || '', 10);

  return {
    workspace_id:      WORKSPACE_ID,
    company,
    ceo:               (row['이름'] || '').trim() || null,
    phone:             (row['연락처'] || '').trim() || null,
    industry:          (row['업종'] || '').trim() || null,
    business_age:      (row['업력'] || '').trim() || null,
    monthly_revenue:   (row['매출'] || '').trim() || null,
    region:            (row['지역'] || '').trim() || null,
    lead_source:       (row['유입경로'] || '').trim() || null,
    received_date:     parseDate(row['접수일']),
    status:            (row['상태'] || '').trim() || '신규',
    credit_score:      (() => { const n = extractNumber(row['신용점수']); return n !== null ? Math.round(n) : null; })(),
    tax_delinquent:    (row['세급체납여부'] || '').trim() === '있음',
    overdue_history:   parseBool(row['연체이력']),
    birth_date:        parseDate(row['생년월일']),
    employee_count:    (() => { const n = extractNumber(row['상시근로자수']); return n !== null ? Math.round(n) : null; })(),
    policy_fund_usage: parseBool(row['정책자금사용여부']),
    business_reg_date: parseDate(row['사업자등록일']),
    existing_loan:     parseExistingLoan(row['기대출']),
    required_funds:    extractNumber(row['필요자금']),
    is_exporter:       parseBool(row['수출여부']),
    smart_device:      parseBool(row['스마트기기 이용여부']),
    closure_history:   parseBool(row['폐업이력']),
    aippin_id:         (row['아이핀ID'] || '').trim() || null,
    aippin_pw:         (row['아이핀PW'] || '').trim() || null,
    aippin_2fa:        (row['아이핀2차'] || '').trim() || null,
    sbiz_id:           (row['소진공ID'] || '').trim() || null,
    sbiz_pw:           (row['소진공PW'] || '').trim() || null,
    resident_id_front: (row['주민등록번호'] || '').trim() || null,
    business_reg_no:   (row['사업자등록번호'] || '').trim() || null,
    received_month:    (row['접수월'] || '').trim() || null,
    contract_amount:   extractNumber(row['계약금/수수료']),
    customer_no:       !isNaN(customerNo) ? customerNo : null,
    tags:              parseTags(row['Tags']),
    consultant:        mapConsultant(row['담당자']),
    consultation_memo: buildMemo(row),
  };
}

// ──────────────────────────────────────────────
// 에러 로그
// ──────────────────────────────────────────────

const errorLines = [];
function logError(msg) {
  errorLines.push(`[${new Date().toISOString()}] ${msg}`);
  console.error('[에러]', msg);
}
function flushErrorLog() {
  if (!errorLines.length) return;
  fs.appendFileSync(ERROR_LOG_PATH, errorLines.join('\n') + '\n', 'utf8');
  console.log(`\n에러 로그 저장: ${ERROR_LOG_PATH} (${errorLines.length}건)`);
}

// ──────────────────────────────────────────────
// 메인
// ──────────────────────────────────────────────

async function main() {
  const args     = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');
  const isRun    = args.includes('--run');

  if (!isDryRun && !isRun) {
    console.error('사용법:');
    console.error('  node scripts/migrate_airtable.js --dry-run');
    console.error('  node scripts/migrate_airtable.js --run');
    process.exit(1);
  }

  if (isRun && !SERVICE_ROLE_KEY) {
    console.error('[오류] --run 실행 시 Service Role Key 필요');
    console.error('       SUPABASE_SERVICE_KEY=xxx node scripts/migrate_airtable.js --run');
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, isRun ? SERVICE_ROLE_KEY : ANON_KEY);

  // 1. CSV 읽기
  if (!fs.existsSync(CSV_PATH)) {
    console.error(`[오류] CSV 파일 없음: ${CSV_PATH}`);
    process.exit(1);
  }

  const raw = fs.readFileSync(CSV_PATH, 'utf8').replace(/^\uFEFF/, '');

  const { data: records, errors } = Papa.parse(raw, {
    header:         true,
    skipEmptyLines: true,
    dynamicTyping:  false,
  });

  if (errors.length > 0) {
    console.warn(`[경고] CSV 파싱 경고 ${errors.length}건 (줄바꿈 포함 셀 등 정상 처리됨)`);
  }
  console.log(`총 ${records.length}행 파싱 완료`);

  // 2. 번호 오름차순 정렬
  records.sort((a, b) => {
    const na = parseInt(a['번호'] || '0', 10) || 0;
    const nb = parseInt(b['번호'] || '0', 10) || 0;
    return na - nb;
  });

  // 3. 행 변환
  const mapped = [];
  for (const row of records) {
    try {
      mapped.push({ _raw: row, ...mapRow(row) });
    } catch (e) {
      logError(`행 변환 실패 (번호=${row['번호']}, 이름=${row['이름']}): ${e.message}`);
    }
  }

  // 4. 통계
  const validRows    = mapped.filter(r => r.phone);
  const invalidCount = mapped.length - validRows.length;

  const consultantFailCount = mapped.filter(r => {
    const name = (r._raw['담당자'] || '').trim();
    return name && !name.includes('자금지원센터') && !name.includes('성장') && name.length <= 20 && !CONSULTANT_MAP[name];
  }).length;

  // 5. 중복 체크
  let existingPhones = new Set();
  if (isRun) {
    console.log('\nDB 기존 연락처 조회 중...');
    const { data, error } = await supabase
      .from('customers')
      .select('phone')
      .eq('workspace_id', WORKSPACE_ID)
      .not('phone', 'is', null);
    if (error) {
      console.warn('[경고] 중복 체크 실패:', error.message);
    } else {
      existingPhones = new Set((data || []).map(r => r.phone));
      console.log(`기존 DB: ${existingPhones.size}건`);
    }
  }

  const skipRows   = validRows.filter(r => existingPhones.has(r.phone));
  const insertRows = validRows
    .filter(r => !existingPhones.has(r.phone))
    .map(({ _raw, ...rest }) => rest);

  // 6. 결과 출력
  const prefix = isDryRun ? '[DRY-RUN]' : '[RUN]';
  console.log(`\n${prefix} 파싱 완료: ${records.length}행`);
  console.log(`${prefix} 유효 (phone 있음): ${validRows.length}건`);
  console.log(`${prefix} phone 없어서 제외: ${invalidCount}건`);
  console.log(`${prefix} 중복 skip: ${skipRows.length}건`);
  console.log(`${prefix} 담당자 매핑 실패 (→null): ${consultantFailCount}건`);
  console.log(`${prefix} INSERT 예정: ${insertRows.length}건`);

  // 7. 샘플 3건
  console.log('\n샘플 3건:');
  insertRows.slice(0, 3).forEach((r, i) => {
    console.log(`  [${i+1}]`, JSON.stringify({
      customer_no:     r.customer_no,
      company:         r.company,
      ceo:             r.ceo,
      phone:           r.phone,
      status:          r.status,
      consultant:      r.consultant,
      received_date:   r.received_date,
      business_age:    r.business_age,
      monthly_revenue: r.monthly_revenue,
    }));
  });

  if (isDryRun) {
    console.log('\n[DRY-RUN] 완료 — 실제 INSERT 없음');
    console.log('실행하려면: SUPABASE_SERVICE_KEY=xxx node scripts/migrate_airtable.js --run');
    flushErrorLog();
    return;
  }

  // 8. 배치 INSERT
  console.log(`\nINSERT 시작 (배치 ${BATCH_SIZE}건씩)...`);
  let successCount = 0;
  let failCount    = 0;

  for (let i = 0; i < insertRows.length; i += BATCH_SIZE) {
    const batch      = insertRows.slice(i, i + BATCH_SIZE);
    const batchNum   = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatch = Math.ceil(insertRows.length / BATCH_SIZE);
    process.stdout.write(`배치 ${batchNum}/${totalBatch} (${i+1}~${Math.min(i+BATCH_SIZE, insertRows.length)}건)... `);

    const { error } = await supabase.from('customers').insert(batch);

    if (error) {
      process.stdout.write('실패, 개별 재시도\n');
      for (const record of batch) {
        const { error: e2 } = await supabase.from('customers').insert(record);
        if (e2) {
          logError(`INSERT 실패 (no=${record.customer_no}, phone=${record.phone}): ${e2.message}`);
          failCount++;
        } else {
          successCount++;
        }
      }
    } else {
      process.stdout.write('완료\n');
      successCount += batch.length;
    }
  }

  console.log(`\n마이그레이션 완료`);
  console.log(`  성공: ${successCount}건`);
  console.log(`  실패: ${failCount}건`);
  flushErrorLog();
}

main().catch(err => {
  console.error('[치명적 오류]', err);
  process.exit(1);
});
