import { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react'
import { useT } from '../../theme.jsx'
import { supabase } from '../../supabase.js'
import { DetailSkeleton } from '../Common.jsx'
import { SIDO_LIST, parseSido, parseSigungu } from '../../utils/region.js'
import { SigunguField } from './RegionFields.jsx'
import TabDocuments from './TabDocuments.jsx'

// ─── textarea auto-resize 헬퍼 ────────────────────────────────────────
// height='auto' → reflow → 브라우저가 cursor를 viewport에 맞추려 부모 스크롤을 이동시키는 버그 방지
// resize 전 부모 스크롤 컨테이너의 scrollTop을 저장하고, resize 후 복원한다
function getScrollParent(el) {
  let node = el.parentElement
  while (node && node !== document.body) {
    const { overflowY } = window.getComputedStyle(node)
    if (overflowY === 'auto' || overflowY === 'scroll') return node
    node = node.parentElement
  }
  return document.scrollingElement
}

function autoResizeTextarea(el) {
  const scrollParent = getScrollParent(el)
  const parentScrollTop = scrollParent ? scrollParent.scrollTop : 0
  const savedScrollTop = el.scrollTop

  el.style.height = '1px'           // 'auto' 대신 1px — layout reflow 최소화로 scroll 재계산 방지
  el.style.height = el.scrollHeight + 'px'

  el.scrollTop = savedScrollTop
  if (scrollParent) scrollParent.scrollTop = parentScrollTop
}

// 보유 인증 선택지 — DB CHECK(customers_certifications_allowed)와 동일하게 유지
const CERTIFICATION_OPTIONS = ['특허', 'ISO', '벤처', '이노비즈', '메인비즈', '기업부설연구소', '기타']

// ─── 상태 배지 색상 설정 ───────────────────────────────────────────────
export const STATUS_CONFIG = {
  // 그룹1: 자주 사용
  신규:    { bg: '#1d6fe822', color: '#1d6fe8', border: '#1d6fe844' },
  재통화:  { bg: '#0ea5e922', color: '#0ea5e9', border: '#0ea5e944' },
  상담중:  { bg: '#8b5cf622', color: '#8b5cf6', border: '#8b5cf644' },
  부재:    { bg: '#6b84a822', color: '#6b84a8', border: '#6b84a844' },
  거절:    { bg: '#ec489922', color: '#ec4899', border: '#ec489944' },
  // 그룹2: 진행 단계
  계약:    { bg: '#0ea57122', color: '#0ea571', border: '#0ea57144' },
  상품접수:{ bg: '#22c55e22', color: '#22c55e', border: '#22c55e44' },
  서류준비:{ bg: '#eab30822', color: '#eab308', border: '#eab30844' },
  심사중:  { bg: '#f9731622', color: '#f97316', border: '#f9731644' },
  승인:    { bg: '#16a34a22', color: '#16a34a', border: '#16a34a44' },
  부결:    { bg: '#dc354522', color: '#dc3545', border: '#dc354544' },
  연락두절:{ bg: '#37415122', color: '#9ca3af', border: '#37415144' },
  기타:    { bg: '#6b728022', color: '#6b7280', border: '#6b728044' },
  지원금문의: { bg: '#7c3aed22', color: '#7c3aed', border: '#7c3aed44' },
  // legacy — 기존 데이터 배지 표시용
  중요:    { bg: '#dc262622', color: '#dc2626', border: '#dc262644' },
}

export const STATUS_GROUPS = [
  { label: '자주 사용', items: ['신규', '재통화', '상담중', '부재', '거절'] },
  { label: '진행 단계', items: ['계약', '상품접수', '서류준비', '심사중', '승인', '부결', '연락두절', '기타', '지원금문의'] },
]

const LEAD_SOURCE_CONFIG = {
  당근:     { bg: '#ff700222', color: '#ff7002', border: '#ff700244' },
  메타:     { bg: '#1877f222', color: '#1877f2', border: '#1877f244' },
  점포라인: { bg: '#00b35b22', color: '#00b35b', border: '#00b35b44' },
  렌탈:     { bg: '#7c3aed22', color: '#7c3aed', border: '#7c3aed44' },
  소개:     { bg: '#0ea5e922', color: '#0ea5e9', border: '#0ea5e944' },
  기타:     { bg: '#6b728022', color: '#6b7280', border: '#6b728044' },
}

// 드롭다운 프리셋 목록 (직접입력 맨 위)
const LEAD_SOURCE_PRESETS = ['직접입력', ...Object.keys(LEAD_SOURCE_CONFIG)]

const STATUS_LIST = STATUS_GROUPS.flatMap(g => g.items)

const BUSINESS_TYPE_LIST = ['개인사업자', '법인사업자']

// ─── 전화번호 자동 하이픈 ──────────────────────────────────────────────
function formatPhone(value) {
  const digits = value.replace(/\D/g, '').slice(0, 11)
  if (digits.length < 4) return digits
  if (digits.length < 8) return `${digits.slice(0, 3)}-${digits.slice(3)}`
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`
}

// ─── 사업자등록번호 자동 하이픈 (000-00-00000) ─────────────────────────────
function formatBizRegNo(value) {
  const digits = value.replace(/\D/g, '').slice(0, 10)
  if (digits.length < 4) return digits
  if (digits.length < 6) return `${digits.slice(0, 3)}-${digits.slice(3)}`
  return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`
}

// ─── 날짜 연도 4자리 강제 (type="date" 6자리 입력 방지) ─────────────────────
function clampDateYear(val) {
  if (!val) return null
  const parts = val.split('-')
  if (parts.length !== 3) return val || null
  const year = parts[0].slice(0, 4)
  return `${year}-${parts[1]}-${parts[2]}`
}

// ─── 색상 배지 (읽기 모드) ────────────────────────────────────────────
function ColorBadge({ value, config }) {
  if (!value) return <span style={{ color: '#6b84a8', fontSize: 13 }}>-</span>
  const style = config[value] ?? { bg: '#6b728022', color: '#6b7280', border: '#6b728044' }
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 10px',
      borderRadius: 999,
      fontSize: 12,
      fontWeight: 600,
      background: style.bg,
      color: style.color,
      border: `1px solid ${style.border}`,
    }}>
      {value}
    </span>
  )
}

// ─── 색상 셀렉트 (편집 모드) ──────────────────────────────────────────
function ColorSelect({ value, options, groups, config, onChange, placeholder }) {
  const C = useT()
  const style = value ? (config[value] ?? {}) : {}
  return (
    <select
      value={value ?? ''}
      onChange={e => onChange(e.target.value || null)}
      style={{
        padding: '6px 10px',
        borderRadius: 8,
        border: `1px solid ${value ? (style.border ?? C.line) : C.line}`,
        background: value ? (style.bg ?? C.s3) : C.s3,
        color: value ? (style.color ?? C.text) : C.sub,
        fontSize: 13,
        fontWeight: value ? 600 : 400,
        cursor: 'pointer',
        width: '100%',
        outline: 'none',
      }}
    >
      <option value="">{placeholder ?? '선택'}</option>
      {groups
        ? groups.flatMap((g, gi) => [
            ...(gi > 0 ? [<option key="__sep__" disabled value="">──────────</option>] : []),
            ...g.items.map(opt => <option key={opt} value={opt}>{opt}</option>),
          ])
        : options?.map(opt => <option key={opt} value={opt}>{opt}</option>)
      }
    </select>
  )
}

// ─── 유입경로 드롭다운 + 직접입력 혼합 필드 ────────────────────────────────
function LeadSourceField({ value, onChange }) {
  const C = useT()
  // DB 값이 프리셋에 없으면 직접입력 모드로 시작
  const isCustom = value && !LEAD_SOURCE_CONFIG[value]
  const [direct, setDirect] = useState(isCustom)

  useEffect(() => {
    const custom = value && !LEAD_SOURCE_CONFIG[value]
    setDirect(custom)
  }, [value])

  const cfg = value ? (LEAD_SOURCE_CONFIG[value] ?? {}) : {}
  const selectVal = direct ? '직접입력' : (value ?? '')

  const inputStyle = {
    padding: '6px 10px', borderRadius: 8, border: `1px solid ${C.line}`,
    background: C.s3, color: C.text, fontSize: 13, width: '100%',
    outline: 'none', boxSizing: 'border-box',
  }

  const handleSelect = (e) => {
    const v = e.target.value
    if (v === '직접입력') {
      setDirect(true)
      onChange(null)
    } else if (v === '') {
      setDirect(false)
      onChange(null)
    } else {
      setDirect(false)
      onChange(v)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <select
        value={selectVal}
        onChange={handleSelect}
        style={{
          ...inputStyle,
          border: `1px solid ${value && !direct ? (cfg.border ?? C.line) : C.line}`,
          background: value && !direct ? (cfg.bg ?? C.s3) : C.s3,
          color: value && !direct ? (cfg.color ?? C.text) : (selectVal ? C.text : C.sub),
          fontWeight: value && !direct ? 600 : 400,
          cursor: 'pointer',
        }}
      >
        <option value="">유입경로 선택</option>
        {LEAD_SOURCE_PRESETS.map(opt => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
      {direct && (
        <input
          style={inputStyle}
          value={value ?? ''}
          onChange={e => onChange(e.target.value || null)}
          placeholder="유입경로 직접 입력"
          autoFocus
        />
      )}
    </div>
  )
}

// ─── 지역 드롭다운 (17개 표준 시/도) ────────────────────────────────────
// region은 DB 트리거가 address로부터 자동 파생·정규화하므로 자유 텍스트를 허용하지 않는다.
function RegionField({ value, onChange }) {
  const C = useT()

  const inputStyle = {
    padding: '6px 10px', borderRadius: 8, border: `1px solid ${C.line}`,
    background: C.s3, color: C.text, fontSize: 13, width: '100%',
    outline: 'none', boxSizing: 'border-box',
  }

  return (
    <select
      value={value ?? ''}
      onChange={e => onChange(e.target.value || null)}
      style={{
        ...inputStyle,
        cursor: 'pointer',
        color: value ? C.text : C.sub,
      }}
    >
      <option value="">지역 선택</option>
      {SIDO_LIST.map(opt => (
        <option key={opt} value={opt}>{opt}</option>
      ))}
    </select>
  )
}

// ─── 3단계 선택 (미확인/있음/없음) ─────────────────────────────────────
// null = 미확인, true = 있음, false = 없음
// DB 에서 오는 값 타입 불일치(문자열/숫자)는 boolean 으로 정규화
// 사고이력·체납·폐업 등 위험 신호 항목: 있음=빨강, 없음=녹색, 미확인=회색
function TriStatePair({ value, onChange }) {
  const C = useT()
  const normalized = value == null
    ? null
    : (value === true || value === 1 || value === 'true')

  const OPTIONS = [
    { v: null,  label: '미확인', color: C.sub },
    { v: true,  label: '있음',   color: C.error },
    { v: false, label: '없음',   color: C.green },
  ]

  return (
    <div style={{ display: 'flex', gap: 6 }}>
      {OPTIONS.map(({ v, label, color }) => {
        const isActive = normalized === v
        return (
          <button
            key={label}
            type="button"
            onClick={() => { if (!isActive) onChange(v) }}
            style={{
              flex: 1,
              padding: '6px 0',
              borderRadius: 8,
              border: `1px solid ${isActive ? color : C.line}`,
              background: isActive ? `${color}22` : C.s3,
              color: isActive ? color : C.sub,
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}

// ─── 라벨 + 값 래퍼 ──────────────────────────────────────────────────
function FieldWrapper({ label, children, spanFull }) {
  const C = useT()
  return (
    <div style={{ gridColumn: spanFull ? '1 / -1' : undefined }}>
      <div style={{ fontSize: 11, color: C.sub, marginBottom: 5, fontWeight: 600, letterSpacing: '0.04em' }}>
        {label}
      </div>
      {children}
    </div>
  )
}

// ─── 공통 텍스트 인풋 스타일 ──────────────────────────────────────────
function useInputStyle() {
  const C = useT()
  return {
    width: '100%',
    padding: '7px 10px',
    borderRadius: 8,
    border: `1px solid ${C.line}`,
    background: C.s3,
    color: C.text,
    fontSize: 13,
    outline: 'none',
    boxSizing: 'border-box',
  }
}

// ─── 주소 변경 → 지역(시/도)·상세지역(시/군/구) 자동 판별 ────────────────
// 기본정보 '주소'와 1차콜 '소재지'가 같은 address 컬럼을 쓰므로 동일 로직 공유
function changeAddress(value, data, onChange) {
  const v = value || null
  onChange('address', v)
  const sido = parseSido(v)
  if (sido) {
    if (sido !== data.region) onChange('region_detail', null)
    onChange('region', sido)
    const d = parseSigungu(v, sido)
    if (d) onChange('region_detail', d)
  }
}

// 모바일 1열 / 데스크톱 2열 그리드
function gridStyle(isMobile) {
  return { display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 16 }
}

// ─── 탭1: 기본정보 ──────────────────────────────────────────────────
function TabBasic({ data, onChange, consultants, isMobile }) {
  const memoRef = useRef(null)

  // consultation_memo는 uncontrolled textarea로 관리:
  // 포커스가 없을 때만 DOM 값을 외부 data로 갱신 → 자동저장 리렌더가 커서를 리셋하지 않음
  useEffect(() => {
    const el = memoRef.current
    if (el && document.activeElement !== el) {
      el.value = data.consultation_memo ?? ''
      autoResizeTextarea(el)
    }
  }, [data.consultation_memo])
  const C = useT()
  const inputStyle = useInputStyle()

  return (
    <div style={gridStyle(isMobile)}>

      <FieldWrapper label="담당자">
        <select
          value={data.consultant ?? ''}
          onChange={e => onChange('consultant', e.target.value || null)}
          style={inputStyle}
        >
          <option value="">미배분</option>
          {(consultants ?? []).map(m => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
      </FieldWrapper>

      <FieldWrapper label="상태">
        <ColorSelect
          value={data.status}
          groups={STATUS_GROUPS}
          config={STATUS_CONFIG}
          onChange={v => onChange('status', v)}
          placeholder="상태 선택"
        />
      </FieldWrapper>

      <FieldWrapper label="유입경로">
        <LeadSourceField
          value={data.lead_source}
          onChange={v => onChange('lead_source', v)}
        />
      </FieldWrapper>

      <FieldWrapper label="업체명">
        <input
          style={inputStyle}
          value={data.company ?? ''}
          onChange={e => onChange('company', e.target.value)}
          placeholder="업체명"
        />
      </FieldWrapper>

      <FieldWrapper label="고객명(대표)">
        <input
          style={inputStyle}
          value={data.ceo ?? ''}
          onChange={e => onChange('ceo', e.target.value)}
          placeholder="대표자명"
        />
      </FieldWrapper>

      <FieldWrapper label="연락처">
        <input
          style={inputStyle}
          value={data.phone ?? ''}
          onChange={e => onChange('phone', formatPhone(e.target.value))}
          placeholder="010-0000-0000"
        />
      </FieldWrapper>

      <FieldWrapper label="업종">
        <input
          style={inputStyle}
          value={data.industry ?? ''}
          onChange={e => onChange('industry', e.target.value)}
          placeholder="업종"
        />
      </FieldWrapper>

      <FieldWrapper label="사업자형태">
        <select
          value={data.business_type ?? ''}
          onChange={e => onChange('business_type', e.target.value || null)}
          style={inputStyle}
        >
          <option value="">선택</option>
          {BUSINESS_TYPE_LIST.map(opt => <option key={opt} value={opt}>{opt}</option>)}
        </select>
      </FieldWrapper>

      <FieldWrapper label="사업자등록번호">
        <input
          style={inputStyle}
          value={data.business_reg_no ?? ''}
          onChange={e => onChange('business_reg_no', formatBizRegNo(e.target.value) || null)}
          placeholder="000-00-00000"
          maxLength={12}
        />
      </FieldWrapper>

      <FieldWrapper label="주소">
        <input
          style={inputStyle}
          value={data.address ?? ''}
          onChange={e => changeAddress(e.target.value, data, onChange)}
          placeholder="시/군/구까지 입력하면 지역이 자동 선택됩니다"
        />
      </FieldWrapper>

      <FieldWrapper label="지역">
        <RegionField
          value={data.region}
          onChange={v => { onChange('region', v); if (v !== data.region) onChange('region_detail', null) }}
        />
      </FieldWrapper>

      <FieldWrapper label="상세지역">
        <SigunguField
          sido={data.region}
          value={data.region_detail}
          onChange={v => onChange('region_detail', v)}
          inputStyle={inputStyle}
        />
      </FieldWrapper>

      <FieldWrapper label="업력">
        <input
          type="text"
          style={inputStyle}
          value={data.business_age ?? ''}
          onChange={e => onChange('business_age', e.target.value || null)}
          placeholder="예: 3년 2개월"
        />
      </FieldWrapper>

      <FieldWrapper label="월평균매출">
        <input
          type="text"
          style={inputStyle}
          value={data.monthly_revenue ?? ''}
          onChange={e => onChange('monthly_revenue', e.target.value || null)}
          placeholder="예: 3,500만원"
        />
      </FieldWrapper>

      <FieldWrapper label="접수일">
        <input
          type="date"
          style={inputStyle}
          value={clampDateYear(data.received_date) ?? ''}
          onChange={e => onChange('received_date', clampDateYear(e.target.value))}
          min="1900-01-01"
          max="2099-12-31"
        />
      </FieldWrapper>

      <FieldWrapper label="생년월일">
        <input
          type="date"
          style={inputStyle}
          value={clampDateYear(data.birth_date) ?? ''}
          onChange={e => onChange('birth_date', clampDateYear(e.target.value))}
          min="1900-01-01"
          max="2099-12-31"
        />
      </FieldWrapper>

      <FieldWrapper label="사업자등록일">
        <input
          type="date"
          style={inputStyle}
          value={clampDateYear(data.business_reg_date) ?? ''}
          onChange={e => onChange('business_reg_date', clampDateYear(e.target.value))}
          min="1900-01-01"
          max="2099-12-31"
        />
      </FieldWrapper>

      <FieldWrapper label="계약금">
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input
            type="text"
            style={{ ...inputStyle, flex: 1 }}
            value={data.contract_amount ?? ''}
            onChange={e => onChange('contract_amount', e.target.value || null)}
            placeholder="예: 150"
          />
          <span style={{ color: C.sub, fontSize: 13, whiteSpace: 'nowrap' }}>만원</span>
        </div>
      </FieldWrapper>

      <FieldWrapper label="수수료">
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input
            type="number"
            style={{ ...inputStyle, flex: 1 }}
            value={data.commission_rate ?? ''}
            onChange={e => onChange('commission_rate', e.target.value === '' ? null : Number(e.target.value))}
            placeholder="0"
          />
          <span style={{ color: C.sub, fontSize: 13, whiteSpace: 'nowrap' }}>%</span>
        </div>
      </FieldWrapper>

      <FieldWrapper label="상담내용" spanFull>
        {/* uncontrolled: defaultValue로 초기값만 주입, 이후 DOM이 직접 관리
            → 자동저장 리렌더가 발생해도 커서/스크롤 위치 리셋되지 않음 */}
        <textarea
          ref={memoRef}
          rows={4}
          style={{ ...inputStyle, resize: 'none', lineHeight: 1.6, overflow: 'hidden' }}
          defaultValue={data.consultation_memo ?? ''}
          onChange={e => {
            autoResizeTextarea(e.target)
            onChange('consultation_memo', e.target.value)
          }}
          placeholder="상담 내용을 입력하세요"
        />
      </FieldWrapper>

    </div>
  )
}

// ─── 숫자 입력 + 단위 (숫자만 허용, 빈칸 → null) ──────────────────────
// prefix: 입력칸 안쪽 앞에 붙는 소제목 (예: KCB) — 소제목 줄 없이 다른 입력칸과 같은 높이 유지
function NumberInput({ value, onChange, unit, prefix, maxLength, placeholder = '0' }) {
  const C = useT()
  const inputStyle = useInputStyle()
  const input = (
    <input
      type="text"
      inputMode="numeric"
      style={prefix
        ? { ...inputStyle, flex: 1, minWidth: 0, border: 'none', background: 'transparent', paddingLeft: 0, borderRadius: 0 }
        : { ...inputStyle, flex: 1, minWidth: 0 }}
      value={value ?? ''}
      maxLength={maxLength}
      onChange={e => {
        const v = e.target.value.replace(/[^0-9]/g, '')
        onChange(v === '' ? null : Number(v))
      }}
      placeholder={placeholder}
    />
  )
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      {prefix ? (
        // 테두리·배경은 바깥 박스가 그리고, 안쪽 input 은 투명 → 박스 높이 = 일반 입력칸 높이
        <div style={{
          display: 'flex', alignItems: 'center', flex: 1, minWidth: 0,
          border: `1px solid ${C.line}`, borderRadius: inputStyle.borderRadius, background: C.s3,
        }}>
          <span style={{ color: C.sub, fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', padding: '0 8px 0 10px' }}>
            {prefix}
          </span>
          {input}
        </div>
      ) : input}
      {unit && <span style={{ color: C.sub, fontSize: 13, whiteSpace: 'nowrap' }}>{unit}</span>}
    </div>
  )
}

// ─── 탭2: 1차콜 ────────────────────────────────────────────────────
// 연동 항목은 기본정보와 같은 컬럼을 그대로 사용 (ceo, company, industry, business_type,
// address, business_reg_date). 모든 항목은 일반 customers UPDATE 경로로 저장.
function TabCallLog({ data, onChange, isMobile }) {
  const C = useT()
  const inputStyle = useInputStyle()
  const notesRef = useRef(null)

  // call_notes 는 uncontrolled textarea (상담내용과 동일): 포커스 없을 때만 외부 값 반영
  useEffect(() => {
    const el = notesRef.current
    if (el && document.activeElement !== el) {
      el.value = data.call_notes ?? ''
      autoResizeTextarea(el)
    }
  }, [data.call_notes])

  const isYes = v => v === true || v === 1 || v === 'true'

  const certs = Array.isArray(data.certifications) ? data.certifications : []
  const toggleCert = (opt) => {
    const next = certs.includes(opt) ? certs.filter(c => c !== opt) : [...certs, opt]
    // 선택지 순서로 정렬해 저장, 비면 null
    const ordered = CERTIFICATION_OPTIONS.filter(o => next.includes(o))
    onChange('certifications', ordered.length ? ordered : null)
  }

  return (
    <div style={gridStyle(isMobile)}>

      {/* 1. 대표자명 / 2. 사업자명 */}
      <FieldWrapper label="대표자명">
        <input style={inputStyle} value={data.ceo ?? ''}
          onChange={e => onChange('ceo', e.target.value)} placeholder="대표자명" />
      </FieldWrapper>
      <FieldWrapper label="사업자명">
        <input style={inputStyle} value={data.company ?? ''}
          onChange={e => onChange('company', e.target.value)} placeholder="업체명" />
      </FieldWrapper>

      {/* 3. 업태 / 업종 */}
      <FieldWrapper label="업태">
        <input style={inputStyle} value={data.business_category ?? ''}
          onChange={e => onChange('business_category', e.target.value || null)} placeholder="예: 도소매, 제조" />
      </FieldWrapper>
      <FieldWrapper label="업종">
        <input style={inputStyle} value={data.industry ?? ''}
          onChange={e => onChange('industry', e.target.value)} placeholder="업종" />
      </FieldWrapper>

      {/* 4. 개인·법인 / 5. 소재지 */}
      <FieldWrapper label="개인·법인">
        <select value={data.business_type ?? ''} style={inputStyle}
          onChange={e => onChange('business_type', e.target.value || null)}>
          <option value="">선택</option>
          {BUSINESS_TYPE_LIST.map(opt => <option key={opt} value={opt}>{opt}</option>)}
        </select>
      </FieldWrapper>
      <FieldWrapper label="소재지">
        <input style={inputStyle} value={data.address ?? ''}
          onChange={e => changeAddress(e.target.value, data, onChange)}
          placeholder="시/군/구까지 입력하면 지역이 자동 선택됩니다" />
      </FieldWrapper>

      {/* 6. 사업자설립일 / 7. 4대보험 가입자 수 */}
      <FieldWrapper label="사업자설립일">
        <input type="date" style={inputStyle}
          value={clampDateYear(data.business_reg_date) ?? ''}
          onChange={e => onChange('business_reg_date', clampDateYear(e.target.value))}
          min="1900-01-01" max="2099-12-31" />
      </FieldWrapper>
      <FieldWrapper label="4대보험 가입자 수">
        <NumberInput value={data.employee_count} unit="명" maxLength={6}
          onChange={v => onChange('employee_count', v)} />
      </FieldWrapper>

      {/* 8. 전년도 연매출 / 9. 신용점수 — KCB/NICE 는 입력칸 안쪽 prefix (소제목 줄 없이 같은 높이) */}
      <FieldWrapper label="전년도 연매출">
        <NumberInput value={data.prev_year_revenue} unit="만원" maxLength={12}
          onChange={v => onChange('prev_year_revenue', v)} />
      </FieldWrapper>
      <FieldWrapper label="신용점수">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <NumberInput value={data.kcb_score} prefix="KCB" maxLength={4}
            onChange={v => onChange('kcb_score', v)} />
          <NumberInput value={data.nice_score} prefix="NICE" maxLength={4}
            onChange={v => onChange('nice_score', v)} />
        </div>
      </FieldWrapper>

      {/* 10. 기존 대출 — 종류는 prefix, 단위는 라벨에 표기 (3칸 폭 확보) */}
      <FieldWrapper label="기존 대출 (만원)" spanFull>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
          {[
            ['loan_policy_fund', '정책자금'],
            ['loan_business', '사업자'],
            ['loan_personal', '개인'],
          ].map(([field, label]) => (
            <NumberInput key={field} value={data[field]} prefix={label} maxLength={12}
              onChange={v => onChange(field, v)} />
          ))}
        </div>
        {data.existing_loan != null && (
          <div style={{ fontSize: 12, color: C.sub, marginTop: 6 }}>
            이전 입력 합계(읽기 전용): {Number(data.existing_loan).toLocaleString()}만원
          </div>
        )}
      </FieldWrapper>

      {/* 11. 회생·파산 등 사고이력 */}
      <FieldWrapper label="회생·파산 등 사고이력" spanFull>
        <TriStatePair value={data.rehabilitation} onChange={v => onChange('rehabilitation', v)} />
        {isYes(data.rehabilitation) && (
          <input style={{ ...inputStyle, marginTop: 8 }} value={data.rehabilitation_memo ?? ''}
            onChange={e => onChange('rehabilitation_memo', e.target.value || null)}
            placeholder="사고이력 내용 (예: 2022년 개인회생 인가, 변제 진행 중)" />
        )}
      </FieldWrapper>

      {/* 12. 세금체납 / 13. 폐업이력 */}
      <FieldWrapper label="세금체납">
        <TriStatePair value={data.tax_delinquent} onChange={v => onChange('tax_delinquent', v)} />
        {isYes(data.tax_delinquent) && (
          <div style={{ marginTop: 8 }}>
            <NumberInput value={data.tax_delinquent_amount} unit="만원" maxLength={12}
              placeholder="체납 금액"
              onChange={v => onChange('tax_delinquent_amount', v)} />
          </div>
        )}
      </FieldWrapper>
      <FieldWrapper label="폐업이력">
        <TriStatePair value={data.closure_history} onChange={v => onChange('closure_history', v)} />
        {isYes(data.closure_history) && (
          <input style={{ ...inputStyle, marginTop: 8 }} value={data.closure_memo ?? ''}
            onChange={e => onChange('closure_memo', e.target.value || null)}
            placeholder="폐업 시기·사유 등" />
        )}
      </FieldWrapper>

      {/* 14. 보유 인증 */}
      <FieldWrapper label="보유 인증" spanFull>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {CERTIFICATION_OPTIONS.map(opt => {
            const checked = certs.includes(opt)
            return (
              <label key={opt} style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '5px 10px', borderRadius: 999, cursor: 'pointer',
                border: `1px solid ${checked ? C.gold : C.line}`,
                background: checked ? `${C.gold}22` : C.s3,
                color: checked ? C.gold : C.sub, fontSize: 12, fontWeight: 600,
              }}>
                <input type="checkbox" checked={checked} onChange={() => toggleCert(opt)}
                  style={{ accentColor: C.gold, margin: 0 }} />
                {opt}
              </label>
            )
          })}
        </div>
        {certs.includes('기타') && (
          <input style={{ ...inputStyle, marginTop: 8 }} value={data.certification_etc ?? ''}
            onChange={e => onChange('certification_etc', e.target.value || null)}
            placeholder="기타 인증 내용" />
        )}
      </FieldWrapper>

      {/* 15. 필요자금 */}
      <FieldWrapper label="필요자금">
        <NumberInput value={data.required_funds} unit="만원" maxLength={12}
          onChange={v => onChange('required_funds', v)} />
      </FieldWrapper>

      {/* 16. 상담 특이사항 */}
      <FieldWrapper label="상담 특이사항" spanFull>
        <textarea
          ref={notesRef}
          rows={4}
          style={{ ...inputStyle, resize: 'none', lineHeight: 1.6, overflow: 'hidden' }}
          defaultValue={data.call_notes ?? ''}
          onChange={e => {
            autoResizeTextarea(e.target)
            onChange('call_notes', e.target.value || null)
          }}
          placeholder="1차 콜 상담 중 특이사항을 입력하세요"
        />
      </FieldWrapper>

    </div>
  )
}

// ─── 메인 패널 컴포넌트 ───────────────────────────────────────────────

// ─── 고객사 상세 패널 ────────────────────────────────────────────────

// 자동저장 debounce — 매 저장이 customers UPDATE + Realtime 브로드캐스트를 유발하므로
// 300ms(타이핑 중 잦은 저장) → 1000ms 로 완화. 필드 이탈(blur) 시에는 즉시 저장.
const AUTOSAVE_DELAY_MS = 1000

const CustomerDetailPanel = forwardRef(function CustomerDetailPanel({ customer, onClose, onUpdate, consultants = [], isDuplicate = false }, ref) {
  const C = useT()
  const [editData, setEditData] = useState({})
  const [dirtyFields, setDirtyFields] = useState(new Set())
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [savedOk, setSavedOk] = useState(false)
  const [activeTab, setActiveTab] = useState('basic')
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768)

  // 최신 데이터를 타이머 콜백에서 참조하기 위한 ref
  const editDataRef = useRef({})
  const dirtyFieldsRef = useRef(new Set())
  const saveTimerRef = useRef(null)
  // 연속 저장 실패 카운터 — 3회 초과 시 자동저장 중단
  const saveFailCountRef = useRef(0)
  // 한글 IME 조합 중 여부 — 조합 중엔 debounce 저장 예약 안 함
  const isComposingRef = useRef(false)

  // dirty 필드만 DB에 기록 (상태 갱신 없음) — 반환: error 또는 null
  const writePatch = async (data, dirty) => {
    const patch = {}
    dirty.forEach(f => { patch[f] = data[f] })
    const { error } = await supabase.from('customers').update(patch).eq('id', data.id)
    return error || null
  }

  // 고객 전환/언마운트 직전: 대기 중인 변경분을 스냅샷으로 기록 (fire-and-forget)
  // 패널 상태는 곧 리셋/소멸되므로 상태 갱신 없이 쓰기만 수행
  const persistPending = () => {
    const data = editDataRef.current
    const dirty = new Set(dirtyFieldsRef.current)
    if (dirty.size === 0 || !data?.id || saveFailCountRef.current >= 3) return
    writePatch(data, dirty).then(error => {
      if (error) console.error('[CustomerDetailPanel] 대기 중 변경분 저장 실패:', error)
      // onUpdate 는 호출하지 않음 — 부모 handleUpdate 가 setSelected 를 하므로
      // 전환/닫기 직후 이전 고객 패널이 다시 열림. 목록 반영은 Realtime UPDATE 가 처리.
    })
  }

  // 모바일 감지
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  // customer prop 변경 시 상태 초기화
  // - 다른 고객으로 전환: 전체 리셋
  // - 같은 고객 데이터 갱신(Realtime/onUpdate): dirty 필드는 보존하여 입력 중 텍스트 유실 방지
  useEffect(() => {
    if (!customer) return
    const isNewCustomer = customer.id !== editDataRef.current?.id
    if (isNewCustomer) {
      // 다른 고객 선택 — 대기 중인 이전 고객 저장은 버리지 않고 즉시 기록한 뒤 전체 리셋
      if (saveTimerRef.current) { clearTimeout(saveTimerRef.current); saveTimerRef.current = null }
      persistPending()
      const data = { ...customer }
      editDataRef.current = data
      dirtyFieldsRef.current = new Set()
      saveFailCountRef.current = 0
      setEditData(data)
      setDirtyFields(new Set())
      setSaveError('')
      setSavedOk(false)
      setIsSaving(false)
    } else {
      // 같은 고객 갱신(Realtime UPDATE 또는 자동저장 후 onUpdate)
      // dirty 필드는 사용자가 편집 중이므로 서버 데이터로 덮어쓰지 않음
      const currentDirty = dirtyFieldsRef.current
      const merged = { ...customer }
      currentDirty.forEach(f => { merged[f] = editDataRef.current[f] })
      editDataRef.current = merged
      setEditData(merged)
      // dirtyFields, saveError, savedOk, isSaving는 그대로 유지
    }
  }, [customer]) // eslint-disable-line react-hooks/exhaustive-deps -- persistPending 은 ref 만 읽으므로 의존성 불필요

  // 다른 고객 선택 시에만 탭을 기본정보로 초기화
  // [customer] 의존성이면 자동저장 후 객체 교체 때도 trigger되므로 id만 감시
  useEffect(() => {
    if (customer?.id) setActiveTab('basic')
  }, [customer?.id])

  // 언마운트 시 타이머 정리 + 대기 중이던 변경분 기록 (debounce 창 안의 입력 유실 방지)
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      persistPending()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── 패널 너비 드래그 조절 ────────────────────────────────────────
  const DEFAULT_PANEL_WIDTH = 480
  const MIN_PANEL_WIDTH = DEFAULT_PANEL_WIDTH
  const MAX_PANEL_WIDTH = Math.round(DEFAULT_PANEL_WIDTH * 1.8) // 864
  const [panelWidthState, setPanelWidthState] = useState(DEFAULT_PANEL_WIDTH)
  const isDraggingWidth = useRef(false)
  const dragStartX = useRef(0)
  const dragStartWidth = useRef(0)

  const handleWidthDragStart = (e) => {
    if (isMobile) return
    isDraggingWidth.current = true
    dragStartX.current = e.clientX
    dragStartWidth.current = panelWidthState
    document.body.style.cursor = 'ew-resize'
    document.body.style.userSelect = 'none'

    const onMouseMove = (ev) => {
      if (!isDraggingWidth.current) return
      const delta = dragStartX.current - ev.clientX // 왼쪽 드래그 = 너비 증가
      const newWidth = Math.min(MAX_PANEL_WIDTH, Math.max(MIN_PANEL_WIDTH, dragStartWidth.current + delta))
      setPanelWidthState(newWidth)
    }

    const onMouseUp = () => {
      isDraggingWidth.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }

  const doAutoSave = async (data, dirty) => {
    if (dirty.size === 0 || !data.id) return
    // 연속 3회 초과 실패 시 자동저장 중단
    if (saveFailCountRef.current >= 3) return
    setIsSaving(true)
    setSavedOk(false)

    const saveError = await writePatch(data, dirty)

    setIsSaving(false)
    if (saveError) {
      saveFailCountRef.current += 1
      const msg = saveFailCountRef.current >= 3
        ? '저장 오류가 반복되어 자동저장이 중단되었습니다. Migration 실행 후 새로고침 해주세요.'
        : '저장 중 오류가 발생했습니다.'
      setSaveError(msg)
    } else {
      saveFailCountRef.current = 0
      setSaveError('')
      setSavedOk(true)
      // 저장 중 사용자가 수정한 필드는 dirty 유지 (비교: 저장 스냅샷 vs 현재 ref 값)
      const newDirty = new Set(dirtyFieldsRef.current)
      dirty.forEach(f => {
        if (editDataRef.current[f] === data[f]) newDirty.delete(f)
        // 저장 후 값이 달라진 필드는 아직 dirty — 다음 debounce가 재저장함
      })
      dirtyFieldsRef.current = newDirty
      setDirtyFields(newDirty)
      // 현재 editDataRef 기준으로 콜백 호출 (저장 스냅샷 아님 — stale 역전파 방지)
      onUpdate?.({ ...editDataRef.current })
    }
  }

  const handleChange = (field, value) => {
    const newData = { ...editDataRef.current, [field]: value }
    const newDirty = new Set(dirtyFieldsRef.current)
    newDirty.add(field)
    editDataRef.current = newData
    dirtyFieldsRef.current = newDirty
    setEditData(newData)
    setDirtyFields(newDirty)
    setSaveError('')
    setSavedOk(false)

    // 한글 IME 조합 중에는 debounce 예약 안 함 — compositionEnd 후 자동 예약됨
    if (!isComposingRef.current) {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      // ref 사용: 타이머 실행 시점의 최신 데이터로 저장 (클로저 캡처 아님)
      saveTimerRef.current = setTimeout(() => doAutoSave(editDataRef.current, dirtyFieldsRef.current), AUTOSAVE_DELAY_MS)
    }
  }

  // 타이머를 취소하고 즉시 저장 후 닫기
  const flushSave = async () => {
    if (saveTimerRef.current) { clearTimeout(saveTimerRef.current); saveTimerRef.current = null }
    await doAutoSave(editDataRef.current, dirtyFieldsRef.current)
  }

  const handleClose = async () => {
    await flushSave()
    onClose()
  }

  useImperativeHandle(ref, () => ({ flushSave }))

  // 기존 사업정보·인증정보 탭은 화면에서 제거 (컬럼은 보존)
  const TABS = [
    { id: 'basic', label: '기본정보' },
    { id: 'call',  label: '1차콜' },
    { id: 'docs',  label: '서류정보' },
  ]

  const panelWidth = isMobile ? '100vw' : panelWidthState

  return (
    <div style={{
      position: 'fixed', top: 0, right: 0, bottom: 0, width: panelWidth,
      background: C.s2, borderLeft: `1px solid ${C.line}`,
      zIndex: 101, display: 'flex', flexDirection: 'column',
      boxShadow: '-8px 0 40px rgba(0,0,0,0.5)',
    }}>

      {/* ── 너비 조절 드래그 핸들 (모바일 제외) ────────────────────── */}
      {!isMobile && (
        <div
          onMouseDown={handleWidthDragStart}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(240,184,64,0.15)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: 6,
            cursor: 'ew-resize',
            zIndex: 10,
            background: 'transparent',
          }}
        />
      )}

      {/* ── 헤더 ─────────────────────────────────────────────── */}
      <div style={{ padding: '18px 24px 16px', borderBottom: `1px solid ${C.line}`, background: C.s2, flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ minWidth: 0, flex: 1, paddingRight: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden' }}>
              <span style={{ fontSize: 16, fontWeight: 700, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
                {editData.company || '-'}
              </span>
              {isDuplicate && (
                <span style={{
                  flexShrink: 0, fontSize: 10, fontWeight: 700,
                  padding: '2px 6px', borderRadius: 4,
                  background: '#f59e0b22', color: '#f59e0b',
                  border: '1px solid #f59e0b55', whiteSpace: 'nowrap',
                }}>중복</span>
              )}
            </div>
            {editData.ceo && (
              <div style={{ fontSize: 13, color: C.sub, marginTop: 3 }}>{editData.ceo}</div>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <button onClick={handleClose} style={{ background: 'none', border: 'none', color: C.sub, fontSize: 20, cursor: 'pointer', lineHeight: 1, padding: '2px 6px' }} title="닫기">✕</button>
          </div>
        </div>
      </div>

      {/* ── 탭 네비게이션 ──────────────────────────────────────── */}
      <div style={{ display: 'flex', borderBottom: `1px solid ${C.line}`, background: C.s2, flexShrink: 0 }}>
        {TABS.map(tab => {
          const isActive = activeTab === tab.id
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
              flex: 1, padding: '11px 4px', border: 'none',
              borderBottom: isActive ? `2px solid ${C.gold}` : '2px solid transparent',
              background: 'none', color: isActive ? C.gold : C.sub,
              fontSize: 12, fontWeight: isActive ? 700 : 400, cursor: 'pointer', transition: 'all 0.15s',
            }}>
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* ── 콘텐츠 영역 ────────────────────────────────────────── */}
      {/* onCompositionStart/End: 이벤트 버블링으로 내부 모든 input에 적용됨 */}
      <div
        style={{ flex: 1, overflowY: 'auto', padding: '20px 24px 0' }}
        onCompositionStart={() => { isComposingRef.current = true }}
        onCompositionEnd={() => {
          isComposingRef.current = false
          // 조합 완료 후 debounce 예약 (compositionEnd 직후 onChange가 발화하므로 거기서 처리됨)
          // 단, onChange가 발화하지 않는 경우(취소)를 위해 여기서도 예약
          if (dirtyFieldsRef.current.size > 0) {
            if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
            saveTimerRef.current = setTimeout(() => doAutoSave(editDataRef.current, dirtyFieldsRef.current), AUTOSAVE_DELAY_MS)
          }
        }}
        // 필드 이탈 시 debounce 대기 없이 즉시 저장 (onBlur는 React에서 버블링됨)
        onBlur={() => {
          if (isComposingRef.current || dirtyFieldsRef.current.size === 0) return
          flushSave()
        }}
      >
        {Object.keys(editData).length === 0 ? (
          <DetailSkeleton fieldCount={8} />
        ) : (
          <>
            {activeTab === 'basic' && <TabBasic data={editData} onChange={handleChange} consultants={consultants} isMobile={isMobile} />}
            {activeTab === 'call' && (
              <TabCallLog
                data={editData}
                onChange={handleChange}
                isMobile={isMobile}
              />
            )}
            {/* 서류는 별도 테이블(customer_documents) — 자체 저장 로직. key 로 고객 전환 시 언마운트 → 대기 메모 저장 */}
            {activeTab === 'docs' && editData.id && (
              <TabDocuments
                key={editData.id}
                customerId={editData.id}
                businessType={editData.business_type}
                isMobile={isMobile}
              />
            )}
          </>
        )}
        <div style={{ height: 56 }} />
      </div>

      {/* ── 하단 자동저장 상태 표시 ────────────────────────────────── */}
      <div style={{
        borderTop: `1px solid ${C.line}`, padding: '10px 24px',
        background: C.s2, flexShrink: 0,
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        {isSaving ? (
          <>
            <span style={{ fontSize: 11, color: C.sub }}>●</span>
            <span style={{ fontSize: 12, color: C.sub }}>저장 중...</span>
          </>
        ) : saveError ? (
          <>
            <span style={{ fontSize: 11, color: C.error }}>●</span>
            <span style={{ fontSize: 12, color: C.error }}>{saveError}</span>
          </>
        ) : dirtyFields.size > 0 ? (
          <>
            <span style={{ fontSize: 11, color: C.gold }}>●</span>
            <span style={{ fontSize: 12, color: C.gold }}>변경사항 저장 대기 중...</span>
          </>
        ) : savedOk ? (
          <>
            <span style={{ fontSize: 11, color: C.green }}>●</span>
            <span style={{ fontSize: 12, color: C.green }}>자동 저장됨</span>
          </>
        ) : (
          <>
            <span style={{ fontSize: 11, color: C.sub }}>●</span>
            <span style={{ fontSize: 12, color: C.sub }}>자동 저장</span>
          </>
        )}
      </div>
    </div>
  )
})

export default CustomerDetailPanel
