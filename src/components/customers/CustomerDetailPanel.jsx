import { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react'
import { useT } from '../../theme.jsx'
import { supabase, getCustomerSensitive } from '../../supabase.js'

// 민감 컬럼 목록 — 일반 UPDATE 경로를 타지 않고 RPC로만 저장
const SENSITIVE_FIELDS = new Set([
  'aippin_id', 'aippin_pw', 'aippin_2fa',
  'sbiz_id', 'sbiz_pw', 'resident_id_front',
])

// ─── 상태 배지 색상 설정 ───────────────────────────────────────────────────────
export const STATUS_CONFIG = {
  신규:    { bg: '#1d6fe822', color: '#1d6fe8', border: '#1d6fe844' },
  재통화:  { bg: '#0ea5e922', color: '#0ea5e9', border: '#0ea5e944' },
  상담중:  { bg: '#8b5cf622', color: '#8b5cf6', border: '#8b5cf644' },
  계약:    { bg: '#0ea57122', color: '#0ea571', border: '#0ea57144' },
  상품접수:{ bg: '#22c55e22', color: '#22c55e', border: '#22c55e44' },
  서류준비:{ bg: '#eab30822', color: '#eab308', border: '#eab30844' },
  심사중:  { bg: '#f9731622', color: '#f97316', border: '#f9731644' },
  승인:    { bg: '#16a34a22', color: '#16a34a', border: '#16a34a44' },
  부결:    { bg: '#dc354522', color: '#dc3545', border: '#dc354544' },
  부재:    { bg: '#6b84a822', color: '#6b84a8', border: '#6b84a844' },
  연락두절:{ bg: '#37415122', color: '#9ca3af', border: '#37415144' },
  거절:    { bg: '#ec489922', color: '#ec4899', border: '#ec489944' },
  기타:    { bg: '#6b728022', color: '#6b7280', border: '#6b728044' },
  중요:    { bg: '#dc262622', color: '#dc2626', border: '#dc262644' },
}

const LEAD_SOURCE_CONFIG = {
  네이버:   { bg: '#0ea57122', color: '#0ea571', border: '#0ea57144' },
  카카오:   { bg: '#eab30822', color: '#ca8a04', border: '#eab30844' },
  지인:     { bg: '#1d6fe822', color: '#1d6fe8', border: '#1d6fe844' },
  유튜브:   { bg: '#dc354522', color: '#dc3545', border: '#dc354544' },
}

// 드롭다운 프리셋 목록 (직접입력 포함)
const LEAD_SOURCE_PRESETS = [...Object.keys(LEAD_SOURCE_CONFIG), '직접입력']

const STATUS_LIST = Object.keys(STATUS_CONFIG)

const REGION_LIST = [
  '서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종',
  '경기', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주',
]

const BUSINESS_TYPE_LIST = ['개인사업자', '법인사업자']

// ─── 전화번호 자동 하이픈 ──────────────────────────────────────────────────────
function formatPhone(value) {
  const digits = value.replace(/\D/g, '').slice(0, 11)
  if (digits.length < 4) return digits
  if (digits.length < 8) return `${digits.slice(0, 3)}-${digits.slice(3)}`
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`
}

// ─── 사업자등록번호 자동 하이픈 (000-00-00000) ─────────────────────────────────
function formatBizRegNo(value) {
  const digits = value.replace(/\D/g, '').slice(0, 10)
  if (digits.length < 4) return digits
  if (digits.length < 6) return `${digits.slice(0, 3)}-${digits.slice(3)}`
  return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`
}

// ─── 날짜 연도 4자리 강제 (type="date" 6자리 입력 방지) ───────────────────────
function clampDateYear(val) {
  if (!val) return null
  const parts = val.split('-')
  if (parts.length !== 3) return val || null
  const year = parts[0].slice(0, 4)
  return `${year}-${parts[1]}-${parts[2]}`
}

// ─── 색상 배지 (읽기 모드) ────────────────────────────────────────────────────
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

// ─── 색상 셀렉트 (편집 모드) ──────────────────────────────────────────────────
function ColorSelect({ value, options, config, onChange, placeholder }) {
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
      {options.map(opt => (
        <option key={opt} value={opt}>{opt}</option>
      ))}
    </select>
  )
}

// ─── 유입경로 드롭다운 + 직접입력 혼합 필드 ──────────────────────────────────────
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

// ─── Toggle 버튼쌍 (있음/없음) ────────────────────────────────────────────────
function TogglePair({ label, value, onChange }) {
  const C = useT()
  return (
    <div>
      <div style={{ fontSize: 11, color: C.sub, marginBottom: 6, fontWeight: 600, letterSpacing: '0.04em' }}>
        {label}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        {[true, false].map(v => {
          const isActive = value === v
          return (
            <button
              key={String(v)}
              onClick={() => onChange(v)}
              style={{
                flex: 1,
                padding: '6px 0',
                borderRadius: 8,
                border: isActive
                  ? `1px solid ${v ? C.green : C.error}`
                  : `1px solid ${C.line}`,
                background: isActive
                  ? (v ? `${C.green}22` : `${C.error}22`)
                  : C.s3,
                color: isActive
                  ? (v ? C.green : C.error)
                  : C.sub,
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {v ? '있음' : '없음'}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─── 라벨 + 값 래퍼 ──────────────────────────────────────────────────────────
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

// ─── 공통 텍스트 인풋 스타일 ──────────────────────────────────────────────────
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

// ─── 탭1: 기본정보 ────────────────────────────────────────────────────────────
function TabBasic({ data, onChange, consultants, isAdmin, canViewAuth }) {
  const C = useT()
  const inputStyle = useInputStyle()

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

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
          options={STATUS_LIST}
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

      <FieldWrapper label="지역">
        <select
          value={data.region ?? ''}
          onChange={e => onChange('region', e.target.value || null)}
          style={inputStyle}
        >
          <option value="">선택</option>
          {REGION_LIST.map(opt => <option key={opt} value={opt}>{opt}</option>)}
        </select>
      </FieldWrapper>

      <FieldWrapper label="업력">
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input
            type="number"
            style={{ ...inputStyle, flex: 1 }}
            value={data.business_age ?? ''}
            onChange={e => onChange('business_age', e.target.value === '' ? null : Number(e.target.value))}
            placeholder="0"
            min={0}
          />
          <span style={{ color: C.sub, fontSize: 13, whiteSpace: 'nowrap' }}>년</span>
        </div>
      </FieldWrapper>

      <FieldWrapper label="월평균매출">
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input
            type="text"
            inputMode="numeric"
            style={{ ...inputStyle, flex: 1 }}
            value={data.monthly_revenue ?? ''}
            onChange={e => {
              const v = e.target.value.replace(/[^0-9]/g, '')
              onChange('monthly_revenue', v === '' ? null : Number(v))
            }}
            placeholder="0"
          />
          <span style={{ color: C.sub, fontSize: 13, whiteSpace: 'nowrap' }}>만원</span>
        </div>
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

      <FieldWrapper label="주민등록번호 앞자리">
        {canViewAuth ? (
          <ResidentIdField
            value={data.resident_id_front}
            onChange={v => onChange('resident_id_front', v)}
          />
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              fontSize: 13, letterSpacing: '0.1em', fontVariantNumeric: 'tabular-nums',
              color: C.sub,
            }}>
              ••••••-•••••••
            </span>
            <span style={{ fontSize: 14 }}>🔒</span>
          </div>
        )}
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
            type="number"
            style={{ ...inputStyle, flex: 1 }}
            value={data.contract_amount ?? ''}
            onChange={e => onChange('contract_amount', e.target.value === '' ? null : Number(e.target.value))}
            placeholder="0"
          />
          <span style={{ color: C.sub, fontSize: 13, whiteSpace: 'nowrap' }}>원</span>
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
        <textarea
          rows={4}
          style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6 }}
          value={data.consultation_memo ?? ''}
          onChange={e => onChange('consultation_memo', e.target.value)}
          placeholder="상담 내용을 입력하세요"
        />
      </FieldWrapper>

    </div>
  )
}

// ─── 주민등록번호 전체 필드 (13자리, DB: 하이픈 없이 저장) ──────────────────
function ResidentIdField({ value, onChange }) {
  const C = useT()
  const inputStyle = useInputStyle()
  const [showBack, setShowBack] = useState(false)
  const [localBack, setLocalBack] = useState(value ? value.slice(6, 13) : '')
  const [backError, setBackError] = useState('')
  const backRef = useRef(null)

  // value: 13자리 숫자 문자열 (하이픈 없음)
  const front = value ? value.slice(0, 6) : ''
  const back  = value ? value.slice(6, 13) : ''

  // 외부 value 변경 시(저장 완료·고객 전환) localBack 동기화
  useEffect(() => {
    setLocalBack(value ? value.slice(6, 13) : '')
  }, [value])

  const handleFrontChange = (e) => {
    const digits = e.target.value.replace(/\D/g, '').slice(0, 6)
    const combined = digits + back
    onChange(combined || null)
    if (digits.length === 6) backRef.current?.focus()
  }

  const handleBackChange = (e) => {
    const digits = e.target.value.replace(/\D/g, '').slice(0, 7)
    setLocalBack(digits)
    if (digits.length > 0 && digits.length < 7) {
      setBackError('주민등록번호 뒷자리는 7자리를 입력해주세요')
    } else {
      setBackError('')
      const combined = front + digits
      onChange(combined || null)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <input
          style={{ ...inputStyle, width: 76, textAlign: 'center', letterSpacing: '0.12em', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}
          value={front}
          onChange={handleFrontChange}
          placeholder="000000"
          maxLength={6}
        />
        <span style={{ color: C.sub, fontSize: 16, fontWeight: 300, flexShrink: 0 }}>-</span>
        <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
          <input
            ref={backRef}
            type={showBack ? 'text' : 'password'}
            style={{ ...inputStyle, width: '100%', textAlign: 'center', letterSpacing: '0.12em', paddingRight: 32 }}
            value={localBack}
            onChange={handleBackChange}
            placeholder="0000000"
            maxLength={7}
          />
          <button
            onClick={() => setShowBack(p => !p)}
            style={{
              position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
              background: 'none', border: 'none', cursor: 'pointer',
              color: C.sub, fontSize: 14, lineHeight: 1, padding: 2,
            }}
          >
            {showBack ? '🙈' : '👁'}
          </button>
        </div>
      </div>
      {backError && (
        <span style={{ fontSize: 11, color: C.error, marginLeft: 2 }}>{backError}</span>
      )}
    </div>
  )
}

// ─── 탭2: 재무정보 ────────────────────────────────────────────────────────────
function TabFinance({ data, onChange }) {
  const C = useT()
  const inputStyle = useInputStyle()

  const numField = (label, field, unit) => (
    <FieldWrapper label={label}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <input
          type="text"
          inputMode="numeric"
          style={{ ...inputStyle, flex: 1 }}
          value={data[field] ?? ''}
          onChange={e => {
            const v = e.target.value.replace(/[^0-9]/g, '')
            onChange(field, v === '' ? null : Number(v))
          }}
          placeholder="0"
        />
        <span style={{ color: C.sub, fontSize: 13, whiteSpace: 'nowrap' }}>{unit}</span>
      </div>
    </FieldWrapper>
  )

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
      {numField('월평균매출', 'monthly_revenue', '만원')}
      {numField('전년도매출', 'prev_year_revenue', '만원')}
      {numField('전전년도매출', 'prev2_year_revenue', '만원')}
      {numField('기대출', 'existing_loan', '만원')}
      {numField('필요자금', 'required_funds', '만원')}
      <FieldWrapper label="신용점수" spanFull>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 13, color: C.sub, whiteSpace: 'nowrap' }}>KCB</span>
          <input
            type="text"
            inputMode="numeric"
            style={{ ...inputStyle, flex: 1 }}
            value={data.kcb_score ?? ''}
            onChange={e => {
              const v = e.target.value.replace(/[^0-9]/g, '')
              onChange('kcb_score', v === '' ? null : Number(v))
            }}
            placeholder="0"
          />
          <span style={{ fontSize: 13, color: C.sub, whiteSpace: 'nowrap' }}>점</span>
          <span style={{ fontSize: 13, color: C.sub, whiteSpace: 'nowrap', marginLeft: 8 }}>NICE</span>
          <input
            type="text"
            inputMode="numeric"
            style={{ ...inputStyle, flex: 1 }}
            value={data.nice_score ?? ''}
            onChange={e => {
              const v = e.target.value.replace(/[^0-9]/g, '')
              onChange('nice_score', v === '' ? null : Number(v))
            }}
            placeholder="0"
          />
          <span style={{ fontSize: 13, color: C.sub, whiteSpace: 'nowrap' }}>점</span>
        </div>
      </FieldWrapper>

      <TogglePair
        label="세금체납"
        value={data.tax_delinquent ?? false}
        onChange={v => onChange('tax_delinquent', v)}
      />
      <TogglePair
        label="연체이력"
        value={data.overdue_history ?? false}
        onChange={v => onChange('overdue_history', v)}
      />
      <TogglePair
        label="회생/파산복구"
        value={data.rehabilitation ?? false}
        onChange={v => onChange('rehabilitation', v)}
      />
      <TogglePair
        label="수출여부"
        value={data.is_exporter ?? false}
        onChange={v => onChange('is_exporter', v)}
      />
    </div>
  )
}

// ─── 탭3: 사업정보 ────────────────────────────────────────────────────────────
function TabBusiness({ data, onChange }) {
  const C = useT()
  const inputStyle = useInputStyle()

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
      <TogglePair
        label="스마트기기 이용여부"
        value={data.smart_device ?? false}
        onChange={v => onChange('smart_device', v)}
      />
      <TogglePair
        label="폐업이력"
        value={data.closure_history ?? false}
        onChange={v => onChange('closure_history', v)}
      />
      <TogglePair
        label="정책자금 사용여부"
        value={data.policy_fund_usage ?? false}
        onChange={v => onChange('policy_fund_usage', v)}
      />
      <FieldWrapper label="상시근로자수">
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input
            type="number"
            style={{ ...inputStyle, flex: 1 }}
            value={data.employee_count ?? ''}
            onChange={e => onChange('employee_count', e.target.value === '' ? null : Number(e.target.value))}
            placeholder="0"
            min={0}
          />
          <span style={{ color: C.sub, fontSize: 13, whiteSpace: 'nowrap' }}>명</span>
        </div>
      </FieldWrapper>
    </div>
  )
}

// ─── 탭4: 인증정보 ────────────────────────────────────────────────────────────
function TabAuth({ data, onChange, isAdmin, canViewAuth }) {
  const C = useT()
  const inputStyle = useInputStyle()
  const [showPw, setShowPw] = useState({})

  // 열람 권한 없음 — 자물쇠 잠금 UI
  if (!canViewAuth) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: '48px 24px', gap: 16, textAlign: 'center',
      }}>
        <div style={{
          width: 56, height: 56, borderRadius: '50%',
          background: C.s3, border: `1px solid ${C.line}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 24,
        }}>
          🔒
        </div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 8 }}>
            접근 권한이 없습니다
          </div>
          <div style={{ fontSize: 13, color: C.sub, lineHeight: 1.7 }}>
            인증정보는 관리자 또는<br />
            담당 컨설턴트만 열람할 수 있습니다.
          </div>
        </div>
      </div>
    )
  }

  const toggleShow = (key) => setShowPw(prev => ({ ...prev, [key]: !prev[key] }))

  const labelStyle = { fontSize: 11, color: C.sub, marginBottom: 5, fontWeight: 600, letterSpacing: '0.04em' }

  const pwField = (label, field) => (
    <div>
      <div style={labelStyle}>{label}</div>
      <div style={{ position: 'relative' }}>
        <input
          type={showPw[field] ? 'text' : 'password'}
          style={{ ...inputStyle, paddingRight: 40 }}
          value={data[field] ?? ''}
          onChange={e => onChange(field, e.target.value)}
          placeholder={label}
        />
        <button
          onClick={() => toggleShow(field)}
          style={{
            position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
            background: 'none', border: 'none', cursor: 'pointer',
            color: C.sub, fontSize: 14, lineHeight: 1, padding: 2,
          }}
        >
          {showPw[field] ? '🙈' : '👁'}
        </button>
      </div>
    </div>
  )

  const sectionTitle = (title) => (
    <div style={{
      fontSize: 11, fontWeight: 800, color: C.sub,
      letterSpacing: '0.1em', textTransform: 'uppercase',
      paddingBottom: 10, marginBottom: 4,
      borderBottom: `1px solid ${C.line}`,
    }}>
      {title}
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* 경고 배너 */}
      <div style={{
        padding: '10px 14px', borderRadius: 10,
        background: `${C.error}11`, border: `1px solid ${C.error}33`,
        color: C.error, fontSize: 12, fontWeight: 500, lineHeight: 1.6,
      }}>
        {isAdmin
          ? '이 정보는 관리자만 열람할 수 있습니다. 외부 유출 금지.'
          : '담당 고객의 인증정보입니다. 외부 유출 금지.'}
      </div>

      {/* 아이핀 카드 */}
      <div style={{ background: C.s3, border: `1px solid ${C.line}`, borderRadius: 12, padding: '16px 18px' }}>
        {sectionTitle('아이핀')}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <div style={labelStyle}>아이핀 ID</div>
            <input style={inputStyle} value={data.aippin_id ?? ''} onChange={e => onChange('aippin_id', e.target.value)} placeholder="아이핀 ID" />
          </div>
          {pwField('아이핀 PW', 'aippin_pw')}
          <div>
            <div style={labelStyle}>아이핀 2차인증</div>
            <input style={inputStyle} value={data.aippin_2fa ?? ''} onChange={e => onChange('aippin_2fa', e.target.value)} placeholder="2차 인증번호" />
          </div>
        </div>
      </div>

      {/* 소진공 카드 */}
      <div style={{ background: C.s3, border: `1px solid ${C.line}`, borderRadius: 12, padding: '16px 18px' }}>
        {sectionTitle('소진공')}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <div style={labelStyle}>소진공 ID</div>
            <input style={inputStyle} value={data.sbiz_id ?? ''} onChange={e => onChange('sbiz_id', e.target.value)} placeholder="소진공 ID" />
          </div>
          {pwField('소진공 PW', 'sbiz_pw')}
        </div>
      </div>
    </div>
  )
}

// ─── 메인 패널 컴포넌트 ───────────────────────────────────────────────────────
const CustomerDetailPanel = forwardRef(function CustomerDetailPanel({ customer, profile, onClose, onUpdate, consultants = [] }, ref) {
  const C = useT()
  const [editData, setEditData] = useState({})
  const [dirtyFields, setDirtyFields] = useState(new Set())
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [savedOk, setSavedOk] = useState(false)
  const [activeTab, setActiveTab] = useState('basic')
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768)
  const sensitiveLoadedRef = useRef(false)

  // 최신 데이터를 타이머 콜백에서 참조하기 위한 ref
  const editDataRef = useRef({})
  const dirtyFieldsRef = useRef(new Set())
  const saveTimerRef = useRef(null)
  // 연속 저장 실패 카운터 — 3회 초과 시 자동저장 중단
  const saveFailCountRef = useRef(0)

  // 모바일 감지
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  // customer prop 변경 시 상태 초기화
  // activeTab은 여기서 건드리지 않음 — 자동저장 후 onUpdate가 같은 고객 객체를 갱신해도 탭이 유지되도록
  useEffect(() => {
    if (saveTimerRef.current) { clearTimeout(saveTimerRef.current); saveTimerRef.current = null }
    if (customer) {
      const data = { ...customer }
      editDataRef.current = data
      dirtyFieldsRef.current = new Set()
      saveFailCountRef.current = 0
      sensitiveLoadedRef.current = false
      setEditData(data)
      setDirtyFields(new Set())
      setSaveError('')
      setSavedOk(false)
      setIsSaving(false)
    }
  }, [customer])

  // 다른 고객 선택 시에만 탭을 기본정보로 초기화
  // [customer] 의존성이면 자동저장 후 객체 교체 때도 trigger되므로 id만 감시
  useEffect(() => {
    if (customer?.id) setActiveTab('basic')
  }, [customer?.id])

  // 언마운트 시 타이머 정리
  useEffect(() => {
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current) }
  }, [])

  const isAdmin = profile?.role === 'admin' || profile?.role === 'superadmin'
  // 본인이 담당 컨설턴트인지 — consultant 컬럼은 profiles.id(uuid) 참조
  const isAssignedConsultant = !isAdmin && customer?.consultant === profile?.id
  // 인증정보 탭 열람 권한: admin이거나, staff 본인이 담당하는 고객
  const canViewAuth = isAdmin || isAssignedConsultant

  // 인증정보 탭 진입 시 민감 컬럼 로드 (열람 권한 있을 때만, 이미 로드됐으면 재요청 안 함)
  useEffect(() => {
    if (activeTab !== 'auth' || !canViewAuth || !customer?.id) return
    if (sensitiveLoadedRef.current) return
    sensitiveLoadedRef.current = true
    getCustomerSensitive(customer.id).then(({ data }) => {
      if (!data) return
      setEditData(prev => ({ ...prev, ...data }))
      editDataRef.current = { ...editDataRef.current, ...data }
    })
  }, [activeTab, customer?.id, canViewAuth])

  const doAutoSave = async (data, dirty) => {
    if (dirty.size === 0 || !data.id) return
    // 연속 3회 초과 실패 시 자동저장 중단
    if (saveFailCountRef.current >= 3) return
    setIsSaving(true)
    setSavedOk(false)

    const regularPatch = {}
    const sensitivePatch = {}
    dirty.forEach(f => {
      if (SENSITIVE_FIELDS.has(f)) sensitivePatch[f] = data[f]
      else regularPatch[f] = data[f]
    })

    let saveError = null

    // 일반 필드: 기존 직접 UPDATE 경로
    if (Object.keys(regularPatch).length > 0) {
      const { error } = await supabase.from('customers').update(regularPatch).eq('id', data.id)
      if (error) saveError = error
    }

    // 민감 필드: RPC 경로 (DB 레벨 역할 체크 포함)
    if (Object.keys(sensitivePatch).length > 0 && !saveError) {
      const { error } = await supabase.rpc('update_customer_sensitive', {
        p_customer_id: data.id,
        p_aippin_id:   sensitivePatch.aippin_id   ?? null,
        p_aippin_pw:   sensitivePatch.aippin_pw   ?? null,
        p_aippin_2fa:  sensitivePatch.aippin_2fa  ?? null,
        p_sbiz_id:     sensitivePatch.sbiz_id     ?? null,
        p_sbiz_pw:     sensitivePatch.sbiz_pw     ?? null,
        p_resident_id: sensitivePatch.resident_id_front ?? null,
      })
      if (error) saveError = error
    }

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
      dirtyFieldsRef.current = new Set()
      setDirtyFields(new Set())
      onUpdate?.({ ...data })
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

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => doAutoSave(newData, newDirty), 300)
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

  const TABS = [
    { id: 'basic',    label: '기본정보' },
    { id: 'finance',  label: '재무정보' },
    { id: 'business', label: '사업정보' },
    { id: 'auth',     label: '인증정보' },
  ]

  const panelWidth = isMobile ? '100vw' : 480

  return (
    <div style={{
      position: 'fixed', top: 0, right: 0, bottom: 0, width: panelWidth,
      background: C.s2, borderLeft: `1px solid ${C.line}`,
      zIndex: 101, display: 'flex', flexDirection: 'column',
      boxShadow: '-8px 0 40px rgba(0,0,0,0.5)',
    }}>

      {/* ── 헤더 ─────────────────────────────────────────────────────── */}
      <div style={{ padding: '18px 24px 16px', borderBottom: `1px solid ${C.line}`, background: C.s2, flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ minWidth: 0, flex: 1, paddingRight: 12 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {editData.company || '-'}
            </div>
            {editData.ceo && (
              <div style={{ fontSize: 13, color: C.sub, marginTop: 3 }}>{editData.ceo}</div>
            )}
          </div>
          <button onClick={handleClose} style={{ background: 'none', border: 'none', color: C.sub, fontSize: 20, cursor: 'pointer', lineHeight: 1, padding: '2px 6px', flexShrink: 0 }} title="닫기">✕</button>
        </div>
      </div>

      {/* ── 탭 네비게이션 ──────────────────────────────────────────────── */}
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

      {/* ── 콘텐츠 영역 ────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px 0' }}>
        {activeTab === 'basic'    && <TabBasic    data={editData} onChange={handleChange} consultants={consultants} isAdmin={isAdmin} canViewAuth={canViewAuth} />}
        {activeTab === 'finance'  && <TabFinance  data={editData} onChange={handleChange} />}
        {activeTab === 'business' && <TabBusiness data={editData} onChange={handleChange} />}
        {activeTab === 'auth'     && <TabAuth     data={editData} onChange={handleChange} isAdmin={isAdmin} canViewAuth={canViewAuth} />}
        <div style={{ height: 56 }} />
      </div>

      {/* ── 하단 자동저장 상태 표시 ──────────────────────────────────────── */}
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
