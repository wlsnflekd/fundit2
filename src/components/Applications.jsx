import React, { useState, useEffect, useRef } from 'react'
import { useT, useIsMobile } from '../theme.jsx'
import { StatusBadge, Button, BottomSheet } from './Common.jsx'
import { getApplications, createApplication, updateApplication, deleteApplication, getCustomers, getFunds, getWorkspaceMembers } from '../supabase.js'

const STATUS_FILTERS = ['전체', '신청예정', '서류준비', '검토중', '보완요청', '승인완료', '반려']
const PRIORITY_OPTIONS = ['상', '중', '하']
const PRIORITY_COLOR = { 상: '#e74c3c', 중: '#f39c12', 하: '#95a5a6' }
const STEPS = ['신청예정', '서류준비', '검토중', '보완요청', '승인완료']

const SECTION_LABEL = {
  fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
  textTransform: 'uppercase', marginBottom: 10, marginTop: 20,
}

function dday(dateStr) {
  if (!dateStr) return null
  const diff = Math.ceil((new Date(dateStr) - new Date()) / 86400000)
  if (diff < 0) return <span style={{ color: '#e74c3c' }}>마감</span>
  if (diff === 0) return <span style={{ color: '#e74c3c', fontWeight: 700 }}>D-Day</span>
  return <span style={{ color: diff <= 7 ? '#e74c3c' : diff <= 14 ? '#f39c12' : undefined }}>D-{diff}</span>
}

function ddayText(dateStr) {
  if (!dateStr) return null
  const diff = Math.ceil((new Date(dateStr) - new Date()) / 86400000)
  if (diff < 0) return { label: '마감', color: '#e74c3c' }
  if (diff === 0) return { label: 'D-Day', color: '#e74c3c' }
  return { label: `D-${diff}`, color: diff <= 7 ? '#e74c3c' : diff <= 14 ? '#f39c12' : '#6b84a8' }
}

function thisMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

// 모바일 카드 — 테이블 대체 (768px 이하)
function AppMobileCard({ app, onSelect, C }) {
  const company = app.customer?.company ?? ''
  const fundName = app.fund?.name ?? app.name ?? ''
  const consultantName = app.consultant_profile?.name ?? ''
  const dd = app.deadline ? ddayText(app.deadline) : null

  return (
    <div
      onClick={() => onSelect(app)}
      style={{
        background: C.s2, border: `1px solid ${C.line}`,
        borderRadius: 12, padding: '14px 16px',
        cursor: 'pointer', marginBottom: 8,
      }}
    >
      {/* 1행: 상태 배지 + D-Day */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <StatusBadge status={app.status} />
        {dd && (
          <span style={{ fontSize: 11, fontWeight: 700, color: dd.color, border: `1px solid ${dd.color}`, borderRadius: 4, padding: '1px 6px' }}>
            {dd.label}
          </span>
        )}
      </div>
      {/* 2행: 고객사명 */}
      <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 2 }}>
        {company || '-'}
      </div>
      {/* 3행: 사업명 */}
      <div style={{
        fontSize: 12, color: C.sub, marginBottom: 6,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {fundName || '-'}
      </div>
      {/* 4행: 담당자 + 금액 + 우선순위 */}
      <div style={{ display: 'flex', gap: 12, fontSize: 11, color: C.sub }}>
        {consultantName && <span>담당: {consultantName}</span>}
        {app.amount != null && <span>{app.amount}억</span>}
        {app.priority && (
          <span style={{ marginLeft: 'auto', fontWeight: 700, color: PRIORITY_COLOR[app.priority] }}>
            {app.priority}
          </span>
        )}
      </div>
    </div>
  )
}

// 신청건 등록 슬라이드 패널
function CreatePanel({ onClose, onCreated, profile }) {
  const C = useT()
  const isMobile = useIsMobile()
  const [customers, setCustomers] = useState([])
  const [funds, setFunds] = useState([])
  const [members, setMembers] = useState([])
  const [form, setForm] = useState({
    customer_id: '',
    fund_id: '',
    name: '',
    status: '신청예정',
    consultant: profile?.id ?? '',
    amount: '',
    deadline: '',
    priority: '중',
    memo: '',
  })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    Promise.all([getCustomers(), getFunds(), getWorkspaceMembers()]).then(([c, f, m]) => {
      setCustomers(c.data ?? [])
      setFunds(f.data ?? [])
      setMembers(m.data ?? [])
    })
  }, [])

  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }))

  const handleSave = async () => {
    if (!form.customer_id) { setErr('고객사를 선택해주세요.'); return }
    setSaving(true)
    setErr('')
    const payload = {
      workspace_id: profile?.workspace_id ?? profile?.workspace?.id,
      customer_id: form.customer_id,
      fund_id: form.fund_id || null,
      name: form.name || null,
      status: form.status,
      consultant: form.consultant || null,
      amount: form.amount ? parseFloat(form.amount) : null,
      deadline: form.deadline || null,
      priority: form.priority,
      memo: form.memo || null,
    }
    const { data, error } = await createApplication(payload)
    setSaving(false)
    if (error) { setErr('저장 중 오류가 발생했습니다.'); console.error(error); return }
    onCreated(data)
    onClose()
  }

  const inputStyle = {
    width: '100%', padding: '8px 10px', background: C.s3, border: `1px solid ${C.line}`,
    borderRadius: 8, color: C.text, fontSize: 13, outline: 'none', boxSizing: 'border-box',
  }
  const labelStyle = { fontSize: 12, color: C.sub, marginBottom: 4, display: 'block' }

  // 폼 본문 — BottomSheet와 데스크탑 패널 양쪽에서 재사용
  const formBody = (
    <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <label style={labelStyle}>고객사 *</label>
        <select value={form.customer_id} onChange={e => set('customer_id', e.target.value)} style={inputStyle}>
          <option value="">고객사 선택</option>
          {customers.map(c => <option key={c.id} value={c.id}>{c.company}</option>)}
        </select>
      </div>
      <div>
        <label style={labelStyle}>정책자금</label>
        <select value={form.fund_id} onChange={e => set('fund_id', e.target.value)} style={inputStyle}>
          <option value="">정책자금 선택 (선택사항)</option>
          {funds.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
      </div>
      <div>
        <label style={labelStyle}>사업명 (직접 입력)</label>
        <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="정책자금 미선택 시 직접 입력" style={inputStyle} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div>
          <label style={labelStyle}>상태</label>
          <select value={form.status} onChange={e => set('status', e.target.value)} style={inputStyle}>
            {STATUS_FILTERS.filter(s => s !== '전체').map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>우선순위</label>
          <select value={form.priority} onChange={e => set('priority', e.target.value)} style={inputStyle}>
            {PRIORITY_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label style={labelStyle}>담당자</label>
        <select value={form.consultant} onChange={e => set('consultant', e.target.value)} style={inputStyle}>
          <option value="">담당자 없음</option>
          {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div>
          <label style={labelStyle}>신청금액 (억원)</label>
          <input type="number" step="0.1" value={form.amount} onChange={e => set('amount', e.target.value)} placeholder="0.0" style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>마감일</label>
          <input type="date" value={form.deadline} onChange={e => set('deadline', e.target.value)} style={inputStyle} />
        </div>
      </div>
      <div>
        <label style={labelStyle}>메모</label>
        <textarea value={form.memo} onChange={e => set('memo', e.target.value)} rows={3} placeholder="메모를 입력하세요" style={{ ...inputStyle, resize: 'vertical' }} />
      </div>
      {err && <div style={{ fontSize: 12, color: '#dc3545' }}>{err}</div>}
      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            flex: 1, padding: '10px', borderRadius: 8, border: 'none', cursor: saving ? 'not-allowed' : 'pointer',
            background: 'linear-gradient(135deg, #f0b840, #d4952a)', color: '#03060d', fontWeight: 700, fontSize: 13,
            opacity: saving ? 0.7 : 1,
          }}
        >{saving ? '저장 중...' : '등록하기'}</button>
        <button onClick={onClose} style={{ padding: '10px 16px', borderRadius: 8, border: `1px solid ${C.line}`, background: 'transparent', color: C.sub, fontSize: 13, cursor: 'pointer' }}>취소</button>
      </div>
    </div>
  )

  if (isMobile) {
    return (
      <BottomSheet open onClose={onClose} title="신청건 등록">
        {formBody}
      </BottomSheet>
    )
  }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(3,6,13,0.6)', zIndex: 100 }} />
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: 440,
        background: C.s2, borderLeft: `1px solid ${C.line}`,
        zIndex: 101, overflowY: 'auto', boxShadow: '-8px 0 32px rgba(0,0,0,0.5)',
      }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '20px 24px', borderBottom: `1px solid ${C.line}`,
          position: 'sticky', top: 0, background: C.s2, zIndex: 1,
        }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>신청건 등록</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: C.sub, fontSize: 20, cursor: 'pointer', padding: 4 }}>✕</button>
        </div>
        {formBody}
      </div>
    </>
  )
}

// 신청건 상세 슬라이드 패널
function DetailPanel({ app, onClose, onUpdated, onDeleted, members }) {
  const C = useT()
  const isMobile = useIsMobile()
  const [form, setForm] = useState({
    status: app.status ?? '',
    priority: app.priority ?? '중',
    amount: app.amount ?? '',
    deadline: app.deadline ?? '',
    memo: app.memo ?? '',
    consultant: app.consultant ?? '',
  })
  const [saveState, setSaveState] = useState('idle') // idle | saving | saved | error
  const [deleting, setDeleting] = useState(false)
  const debounceRef = useRef(null)

  const set = (k, v) => {
    setForm(prev => ({ ...prev, [k]: v }))
    setSaveState('idle')
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      setSaveState('saving')
      const patch = { [k]: v === '' ? null : v }
      if (k === 'amount') patch[k] = v === '' ? null : parseFloat(v)
      const { error } = await updateApplication(app.id, patch)
      if (error) { setSaveState('error'); return }
      setSaveState('saved')
      onUpdated(app.id, patch)
      setTimeout(() => setSaveState('idle'), 2000)
    }, 800)
  }

  const isRejected = form.status === '반려'
  const currentStepIdx = STEPS.indexOf(form.status)
  const ddayInfo = form.deadline ? ddayText(form.deadline) : null

  const inputStyle = {
    width: '100%', padding: '7px 10px', background: C.s3, border: `1px solid ${C.line}`,
    borderRadius: 8, color: C.text, fontSize: 13, outline: 'none', boxSizing: 'border-box',
  }

  const companyName = app.customer?.company ?? app.company ?? ''
  const fundName = app.fund?.name ?? app.name ?? app.fund_name ?? ''

  // 저장 상태 표시 + 삭제 버튼 — 헤더 우측 영역에 공통으로 사용
  const headerActions = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      {saveState === 'saving' && <span style={{ fontSize: 11, color: C.sub }}>저장 중...</span>}
      {saveState === 'saved' && <span style={{ fontSize: 11, color: C.green }}>저장됨</span>}
      {saveState === 'error' && <span style={{ fontSize: 11, color: '#dc3545' }}>저장 실패</span>}
      <button
        onClick={async () => {
          if (!window.confirm('이 신청건을 삭제하시겠습니까?')) return
          setDeleting(true)
          const { error } = await deleteApplication(app.id)
          setDeleting(false)
          if (error) { console.error(error); return }
          onDeleted(app.id)
          onClose()
        }}
        disabled={deleting}
        style={{ padding: '4px 10px', borderRadius: 6, border: `1px solid #dc354566`, background: '#dc354511', color: '#dc3545', fontSize: 11, cursor: deleting ? 'not-allowed' : 'pointer', opacity: deleting ? 0.6 : 1 }}
      >{deleting ? '...' : '삭제'}</button>
    </div>
  )

  // 상세 내용 본문 — BottomSheet와 데스크탑 패널 양쪽에서 재사용
  const detailBody = (
    <div style={{ padding: '20px 24px' }}>
      <div style={{ ...SECTION_LABEL, color: C.sub, marginTop: 0 }}>사업 정보</div>
      <div style={{ display: 'grid', gridTemplateColumns: '72px 1fr', gap: '10px 0', alignItems: 'start' }}>
        <div style={{ fontSize: 12, color: C.sub, paddingTop: 1 }}>사업명</div>
        <div style={{ fontSize: 13, color: C.text, lineHeight: 1.5 }}>{fundName || '-'}</div>
      </div>

      <div style={{ ...SECTION_LABEL, color: C.sub }}>수정 가능 항목</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <div style={{ fontSize: 11, color: C.sub, marginBottom: 4 }}>상태</div>
            <select value={form.status} onChange={e => set('status', e.target.value)} style={inputStyle}>
              {STATUS_FILTERS.filter(s => s !== '전체').map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <div style={{ fontSize: 11, color: C.sub, marginBottom: 4 }}>우선순위</div>
            <select value={form.priority} onChange={e => set('priority', e.target.value)} style={inputStyle}>
              {PRIORITY_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <div style={{ fontSize: 11, color: C.sub, marginBottom: 4 }}>신청금액 (억원)</div>
            <input type="number" step="0.1" value={form.amount} onChange={e => set('amount', e.target.value)} style={inputStyle} />
          </div>
          <div>
            <div style={{ fontSize: 11, color: C.sub, marginBottom: 4 }}>마감일</div>
            <input type="date" value={form.deadline} onChange={e => set('deadline', e.target.value)} style={inputStyle} />
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: C.sub, marginBottom: 4 }}>담당자</div>
          <select value={form.consultant} onChange={e => set('consultant', e.target.value)} style={inputStyle}>
            <option value="">담당자 없음</option>
            {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
      </div>

      <div style={{ ...SECTION_LABEL, color: C.sub }}>메모</div>
      <textarea
        value={form.memo}
        onChange={e => set('memo', e.target.value)}
        rows={3}
        placeholder="메모를 입력하세요"
        style={{
          width: '100%', padding: '10px 12px', background: C.s3, border: `1px solid ${C.line}`,
          borderRadius: 8, color: C.text, fontSize: 13, lineHeight: 1.6, resize: 'vertical',
          outline: 'none', boxSizing: 'border-box',
        }}
      />

      {ddayInfo && (
        <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, color: C.sub }}>{form.deadline}</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: ddayInfo.color, border: `1px solid ${ddayInfo.color}`, borderRadius: 4, padding: '1px 6px' }}>{ddayInfo.label}</span>
        </div>
      )}

      {/* 진행 단계 */}
      <div style={{ ...SECTION_LABEL, color: C.sub }}>진행 단계</div>
      {isRejected ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: 'rgba(231,76,60,0.12)', border: '1px solid rgba(231,76,60,0.3)', borderRadius: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#e74c3c', border: '1px solid #e74c3c', borderRadius: 4, padding: '1px 8px' }}>반려</span>
          <span style={{ fontSize: 13, color: '#e74c3c' }}>이 신청건은 반려 처리되었습니다.</span>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginTop: 8 }}>
          {STEPS.map((step, i) => {
            const isActive = i === currentStepIdx
            const isDone = i < currentStepIdx
            const color = isActive ? C.gold : isDone ? C.green : C.line
            return (
              <React.Fragment key={step}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: color, marginBottom: 4, boxShadow: isActive ? `0 0 6px ${C.gold}` : 'none' }} />
                  <div style={{ fontSize: 9, color, textAlign: 'center', whiteSpace: 'nowrap' }}>{step}</div>
                </div>
                {i < STEPS.length - 1 && (
                  <div style={{ height: 1, flex: 1, background: i < currentStepIdx ? C.green : C.line, marginBottom: 14 }} />
                )}
              </React.Fragment>
            )
          })}
        </div>
      )}

      {/* 모바일: 저장 상태를 본문 하단에 표시 */}
      {isMobile && (
        <div style={{ marginTop: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {headerActions}
        </div>
      )}
    </div>
  )

  if (isMobile) {
    return (
      <BottomSheet open onClose={onClose} title={companyName}>
        {detailBody}
      </BottomSheet>
    )
  }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(3,6,13,0.6)', zIndex: 100 }} />
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: 440,
        background: C.s2, borderLeft: `1px solid ${C.line}`,
        zIndex: 101, overflowY: 'auto', boxShadow: '-8px 0 32px rgba(0,0,0,0.5)',
      }}>
        {/* 헤더 */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '20px 24px', borderBottom: `1px solid ${C.line}`,
          position: 'sticky', top: 0, background: C.s2, zIndex: 1,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>{companyName}</div>
            <StatusBadge status={form.status} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {headerActions}
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: C.sub, fontSize: 20, cursor: 'pointer', padding: 4 }}>✕</button>
          </div>
        </div>
        {detailBody}
      </div>
    </>
  )
}

export default function Applications({ consultantFilter, profile }) {
  const C = useT()
  const isMobile = useIsMobile()
  const [apps, setApps] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [members, setMembers] = useState([])
  const [filter, setFilter] = useState('전체')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(null)
  const [showCreate, setShowCreate] = useState(false)

  const isAdmin = profile?.role === 'admin' || profile?.role === 'superadmin'
  const [viewAll, setViewAll] = useState(false)
  const [consultantViewFilter, setConsultantViewFilter] = useState('')

  const load = async () => {
    setLoading(true)
    setError('')
    const [appsRes, membersRes] = await Promise.all([
      getApplications(),
      getWorkspaceMembers(),
    ])
    if (appsRes.error) {
      console.error(appsRes.error)
      setError('신청건 목록을 불러오지 못했습니다. 다시 시도해주세요.')
    } else {
      setApps(appsRes.data ?? [])
    }
    setMembers(membersRes.data ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  // 역할·뷰 기반 1차 필터 (consultantFilter prop은 "내 신청건" 탭용 기존 동작 유지)
  const scopedApps = (() => {
    if (consultantFilter) return apps.filter(a => a.consultant === consultantFilter)
    if (!isAdmin || !viewAll) return apps.filter(a => a.consultant === profile?.id)
    if (consultantViewFilter) return apps.filter(a => a.consultant === consultantViewFilter)
    return apps
  })()

  // 2차: 상태 + 검색 필터
  const filtered = scopedApps.filter(a => {
    const company = a.customer?.company ?? ''
    const fundName = a.fund?.name ?? a.name ?? ''
    const matchStatus = filter === '전체' || a.status === filter
    const matchSearch = company.includes(search) || fundName.includes(search)
    return matchStatus && matchSearch
  })

  const th = { textAlign: 'left', padding: '8px 12px', color: C.sub, fontSize: 12, fontWeight: 600, borderBottom: `1px solid ${C.line}` }
  const td = { padding: '10px 12px', color: C.text, fontSize: 13, borderBottom: `1px solid ${C.line}` }

  const totalAmount = filtered.reduce((s, a) => s + (a.amount || 0), 0)
  const month = thisMonth()

  const handleToggleViewAll = () => {
    setViewAll(v => !v)
    setConsultantViewFilter('')
  }

  const handleCreated = (newApp) => {
    setApps(prev => [newApp, ...prev])
  }

  const handleUpdated = (id, patch) => {
    setApps(prev => prev.map(a => a.id === id ? { ...a, ...patch } : a))
    if (selected?.id === id) setSelected(prev => ({ ...prev, ...patch }))
  }

  const handleDeleted = (id) => {
    setApps(prev => prev.filter(a => a.id !== id))
    if (selected?.id === id) setSelected(null)
  }

  if (loading) {
    return <div style={{ padding: 32, textAlign: 'center', color: C.sub }}>불러오는 중...</div>
  }

  if (error) {
    return (
      <div style={{ padding: 32, textAlign: 'center' }}>
        <div style={{ color: '#dc3545', marginBottom: 12 }}>{error}</div>
        <button onClick={load} style={{ padding: '8px 16px', borderRadius: 8, border: `1px solid ${C.line}`, background: C.s3, color: C.text, cursor: 'pointer', fontSize: 13 }}>다시 시도</button>
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ margin: 0, color: C.text }}>{consultantFilter ? '내 신청건' : '신청건 관리'}</h3>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {isAdmin && !consultantFilter && (
            <>
              {viewAll && (
                <select
                  value={consultantViewFilter}
                  onChange={e => setConsultantViewFilter(e.target.value)}
                  style={{
                    padding: '6px 10px', borderRadius: 8, border: `1px solid ${C.line}`,
                    background: C.s3, color: C.text, fontSize: 12, outline: 'none', cursor: 'pointer',
                  }}
                >
                  <option value="">전체 컨설턴트</option>
                  {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              )}
              <button
                onClick={handleToggleViewAll}
                style={{
                  padding: '7px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600,
                  border: `1px solid ${viewAll ? C.gold : C.line}`,
                  background: viewAll ? C.gold + '22' : 'transparent',
                  color: viewAll ? C.gold : C.sub,
                }}
              >
                {viewAll ? '내 신청건 보기' : '워크스페이스 전체보기'}
              </button>
            </>
          )}
          <Button variant="primary" onClick={() => setShowCreate(true)}>+ 신청건 등록</Button>
        </div>
      </div>

      {/* 요약 카드 */}
      <div style={{
        display: isMobile ? 'grid' : 'flex',
        gridTemplateColumns: isMobile ? '1fr 1fr' : undefined,
        flexWrap: 'wrap',
        gap: 10,
        marginBottom: 16,
      }}>
        {[
          { label: '전체', value: scopedApps.length, color: C.text },
          { label: '진행중', value: scopedApps.filter(a => ['서류준비', '검토중', '보완요청'].includes(a.status)).length, color: C.gold },
          { label: '승인완료', value: scopedApps.filter(a => a.status === '승인완료').length, color: C.green },
          { label: '이번달 마감', value: scopedApps.filter(a => a.deadline?.startsWith(month)).length, color: '#e74c3c' },
        ].map(stat => (
          <div key={stat.label} style={{ background: C.s2, border: `1px solid ${C.line}`, borderRadius: 10, padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: C.sub, fontSize: 12 }}>{stat.label}</span>
            <span style={{ fontWeight: 700, color: stat.color }}>{stat.value}건</span>
          </div>
        ))}
      </div>

      {/* 필터 */}
      <div style={{
        display: 'flex', gap: 8, marginBottom: 14,
        flexWrap: isMobile ? 'nowrap' : 'wrap',
        overflowX: isMobile ? 'auto' : undefined,
        WebkitOverflowScrolling: 'touch',
        paddingBottom: isMobile ? 4 : undefined,
      }}>
        {STATUS_FILTERS.map(s => (
          <button key={s} onClick={() => setFilter(s)} style={{
            padding: '4px 12px', borderRadius: 999, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
            flexShrink: 0,
            background: filter === s ? C.gold : C.s3, color: filter === s ? C.base : C.sub
          }}>{s}</button>
        ))}
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="고객사·사업명 검색"
          style={{
            marginLeft: 'auto', padding: '4px 12px', borderRadius: 8, border: `1px solid ${C.line}`,
            background: C.s3, color: C.text, fontSize: 12,
            width: isMobile ? 140 : 180, flexShrink: 0,
          }} />
      </div>

      {/* 테이블 (데스크탑) / 카드 목록 (모바일) */}
      {isMobile ? (
        <div>
          {filtered.map(a => (
            <AppMobileCard key={a.id} app={a} onSelect={setSelected} C={C} />
          ))}
          {filtered.length === 0 && (
            <div style={{ padding: 32, textAlign: 'center', color: C.sub }}>
              {apps.length === 0 ? '아직 등록된 신청건이 없습니다. 첫 신청건을 등록해보세요!' : '검색 결과가 없습니다.'}
            </div>
          )}
        </div>
      ) : (
        <div style={{ background: C.s2, border: `1px solid ${C.line}`, borderRadius: 14, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>고객사</th>
                <th style={th}>사업명</th>
                <th style={th}>상태</th>
                <th style={th}>담당자</th>
                <th style={{ ...th, textAlign: 'right' }}>금액(억)</th>
                <th style={th}>마감일</th>
                <th style={{ ...th, textAlign: 'center' }}>우선순위</th>
                <th style={th}>메모</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(a => {
                const company = a.customer?.company ?? ''
                const fundName = a.fund?.name ?? a.name ?? ''
                const consultantName = a.consultant_profile?.name ?? ''
                return (
                  <tr
                    key={a.id}
                    style={{ cursor: 'pointer', background: selected?.id === a.id ? C.s3 : '' }}
                    onClick={() => setSelected(a)}
                    onMouseEnter={e => { if (selected?.id !== a.id) e.currentTarget.style.background = C.s3 }}
                    onMouseLeave={e => { if (selected?.id !== a.id) e.currentTarget.style.background = '' }}
                  >
                    <td style={{ ...td, fontWeight: 600 }}>{company}</td>
                    <td style={{ ...td, maxWidth: 220 }}>
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fundName}</div>
                    </td>
                    <td style={td}><StatusBadge status={a.status} /></td>
                    <td style={td}>{consultantName}</td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>
                      {a.amount != null ? `${a.amount}억` : '-'}
                    </td>
                    <td style={{ ...td, fontSize: 12 }}>
                      <div>{a.deadline ?? '-'}</div>
                      {a.deadline && <div style={{ marginTop: 2, fontSize: 11 }}>{dday(a.deadline)}</div>}
                    </td>
                    <td style={{ ...td, textAlign: 'center' }}>
                      <span style={{ fontWeight: 700, color: PRIORITY_COLOR[a.priority] }}>{a.priority ?? '-'}</span>
                    </td>
                    <td style={{ ...td, color: C.sub, fontSize: 12 }}>{a.memo}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div style={{ padding: 32, textAlign: 'center', color: C.sub }}>
              {apps.length === 0 ? '아직 등록된 신청건이 없습니다. 첫 신청건을 등록해보세요!' : '검색 결과가 없습니다.'}
            </div>
          )}
        </div>
      )}
      <div style={{ marginTop: 8, color: C.sub, fontSize: 12 }}>
        {filtered.length}건 · 합계 {totalAmount.toFixed(1)}억원
      </div>

      {/* 등록 패널 */}
      {showCreate && (
        <CreatePanel
          onClose={() => setShowCreate(false)}
          onCreated={handleCreated}
          profile={profile}
        />
      )}

      {/* 상세 패널 */}
      {selected && !showCreate && (
        <DetailPanel
          app={selected}
          onClose={() => setSelected(null)}
          onUpdated={handleUpdated}
          onDeleted={handleDeleted}
          members={members}
        />
      )}
    </div>
  )
}
