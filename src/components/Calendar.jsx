import { useState, useEffect } from 'react'
import { useT, useIsMobile } from '../theme.jsx'
import { BottomSheet } from './Common.jsx'
import { getSchedules, createSchedule, updateSchedule, deleteSchedule, getCustomers, getWorkspaceMembers } from '../supabase.js'

const TYPE_COLOR = {
  '마감': '#e74c3c',
  '실사': '#3498db',
  '협약': '#27ae60',
  '심사': '#9b59b6',
  '제출': '#f39c12',
  '미팅': '#1abc9c',
  '내부': '#95a5a6',
}

const SCHEDULE_TYPES = ['마감', '실사', '협약', '심사', '제출', '미팅', '내부']

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// 일정 등록 패널
function CreateSchedulePanel({ onClose, onCreated, profile }) {
  const C = useT()
  const isMobile = useIsMobile()
  const [customers, setCustomers] = useState([])
  const [form, setForm] = useState({
    title: '',
    type: '미팅',
    date: todayStr(),
    customer_id: '',
    memo: '',
  })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    getCustomers().then(res => setCustomers(res.data ?? []))
  }, [])

  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }))

  const handleSave = async () => {
    if (!form.title.trim()) { setErr('제목을 입력해주세요.'); return }
    if (!form.date) { setErr('날짜를 선택해주세요.'); return }
    setSaving(true)
    setErr('')
    const payload = {
      workspace_id: profile?.workspace_id ?? profile?.workspace?.id,
      title: form.title.trim(),
      type: form.type,
      date: form.date,
      customer_id: form.customer_id || null,
      memo: form.memo.trim() || null,
      created_by: profile?.id ?? null,
    }
    const { data, error } = await createSchedule(payload)
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
        <label style={labelStyle}>제목 *</label>
        <input value={form.title} onChange={e => set('title', e.target.value)} placeholder="일정 제목 입력" style={inputStyle} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div>
          <label style={labelStyle}>유형</label>
          <select value={form.type} onChange={e => set('type', e.target.value)} style={inputStyle}>
            {SCHEDULE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>날짜 *</label>
          <input type="date" value={form.date} onChange={e => set('date', e.target.value)} style={inputStyle} />
        </div>
      </div>
      <div>
        <label style={labelStyle}>관련 고객사</label>
        <select value={form.customer_id} onChange={e => set('customer_id', e.target.value)} style={inputStyle}>
          <option value="">고객사 없음</option>
          {customers.map(c => <option key={c.id} value={c.id}>{c.company}</option>)}
        </select>
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
            opacity: saving ? 0.7 : 1, minHeight: isMobile ? 44 : undefined,
          }}
        >{saving ? '저장 중...' : '추가하기'}</button>
        <button onClick={onClose} style={{ padding: '10px 16px', borderRadius: 8, border: `1px solid ${C.line}`, background: 'transparent', color: C.sub, fontSize: 13, cursor: 'pointer', minHeight: isMobile ? 44 : undefined }}>취소</button>
      </div>
    </div>
  )

  if (isMobile) {
    return (
      <BottomSheet open onClose={onClose} title="일정 추가">
        {formBody}
      </BottomSheet>
    )
  }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(3,6,13,0.6)', zIndex: 100 }} />
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: 420,
        background: C.s2, borderLeft: `1px solid ${C.line}`,
        zIndex: 101, overflowY: 'auto', boxShadow: '-8px 0 32px rgba(0,0,0,0.5)',
      }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '20px 24px', borderBottom: `1px solid ${C.line}`,
          position: 'sticky', top: 0, background: C.s2, zIndex: 1,
        }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>일정 추가</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: C.sub, fontSize: 20, cursor: 'pointer', padding: 4 }}>✕</button>
        </div>
        {formBody}
      </div>
    </>
  )
}

// 일정 수정 패널
function EditSchedulePanel({ schedule, onClose, onUpdated }) {
  const C = useT()
  const isMobile = useIsMobile()
  const [customers, setCustomers] = useState([])
  const [form, setForm] = useState({
    title: schedule.title ?? '',
    type: schedule.type ?? '미팅',
    date: schedule.date ?? todayStr(),
    customer_id: schedule.customer_id ?? '',
    memo: schedule.memo ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    getCustomers().then(res => setCustomers(res.data ?? []))
  }, [])

  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }))

  const handleSave = async () => {
    if (!form.title.trim()) { setErr('제목을 입력해주세요.'); return }
    if (!form.date) { setErr('날짜를 선택해주세요.'); return }
    setSaving(true)
    setErr('')
    const patch = {
      title: form.title.trim(),
      type: form.type,
      date: form.date,
      customer_id: form.customer_id || null,
      memo: form.memo.trim() || null,
    }
    const { data, error } = await updateSchedule(schedule.id, patch)
    setSaving(false)
    if (error) { setErr('저장 중 오류가 발생했습니다.'); console.error(error); return }
    onUpdated(data)
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
        <label style={labelStyle}>제목 *</label>
        <input value={form.title} onChange={e => set('title', e.target.value)} placeholder="일정 제목 입력" style={inputStyle} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div>
          <label style={labelStyle}>유형</label>
          <select value={form.type} onChange={e => set('type', e.target.value)} style={inputStyle}>
            {SCHEDULE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>날짜 *</label>
          <input type="date" value={form.date} onChange={e => set('date', e.target.value)} style={inputStyle} />
        </div>
      </div>
      <div>
        <label style={labelStyle}>관련 고객사</label>
        <select value={form.customer_id} onChange={e => set('customer_id', e.target.value)} style={inputStyle}>
          <option value="">고객사 없음</option>
          {customers.map(c => <option key={c.id} value={c.id}>{c.company}</option>)}
        </select>
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
            opacity: saving ? 0.7 : 1, minHeight: isMobile ? 44 : undefined,
          }}
        >{saving ? '저장 중...' : '수정 저장'}</button>
        <button onClick={onClose} style={{ padding: '10px 16px', borderRadius: 8, border: `1px solid ${C.line}`, background: 'transparent', color: C.sub, fontSize: 13, cursor: 'pointer', minHeight: isMobile ? 44 : undefined }}>취소</button>
      </div>
    </div>
  )

  if (isMobile) {
    return (
      <BottomSheet open onClose={onClose} title="일정 수정">
        {formBody}
      </BottomSheet>
    )
  }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(3,6,13,0.6)', zIndex: 100 }} />
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: 420,
        background: C.s2, borderLeft: `1px solid ${C.line}`,
        zIndex: 101, overflowY: 'auto', boxShadow: '-8px 0 32px rgba(0,0,0,0.5)',
      }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '20px 24px', borderBottom: `1px solid ${C.line}`,
          position: 'sticky', top: 0, background: C.s2, zIndex: 1,
        }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>일정 수정</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: C.sub, fontSize: 20, cursor: 'pointer', padding: 4 }}>✕</button>
        </div>
        {formBody}
      </div>
    </>
  )
}

export default function Calendar({ profile }) {
  const C = useT()
  const isMobile = useIsMobile()
  const [schedules, setSchedules] = useState([])
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedType, setSelectedType] = useState('전체')
  const [showCreate, setShowCreate] = useState(false)
  const [editingSchedule, setEditingSchedule] = useState(null)
  const [deletingId, setDeletingId] = useState(null)
  const today = todayStr()

  const isAdmin = profile?.role === 'admin' || profile?.role === 'superadmin'
  const [viewAll, setViewAll] = useState(false)
  const [consultantViewFilter, setConsultantViewFilter] = useState('')

  const load = async () => {
    setLoading(true)
    setError('')
    const [schedulesRes, membersRes] = await Promise.all([
      getSchedules(),
      getWorkspaceMembers(),
    ])
    if (schedulesRes.error) {
      console.error(schedulesRes.error)
      setError('일정을 불러오지 못했습니다. 다시 시도해주세요.')
    } else {
      setSchedules(schedulesRes.data ?? [])
    }
    setMembers(membersRes.data ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  // 역할·뷰 기반 1차 필터 (created_by 기준)
  const scopedSchedules = (() => {
    if (!isAdmin || !viewAll) return schedules.filter(s => s.created_by === profile?.id)
    if (consultantViewFilter) return schedules.filter(s => s.created_by === consultantViewFilter)
    return schedules
  })()

  const filtered = scopedSchedules.filter(s =>
    selectedType === '전체' || s.type === selectedType
  )

  const upcoming = filtered.filter(s => s.date >= today)
  const past = filtered.filter(s => s.date < today)

  const types = ['전체', ...SCHEDULE_TYPES]

  const handleCreated = (newSchedule) => {
    setSchedules(prev => [...prev, newSchedule].sort((a, b) => a.date.localeCompare(b.date)))
  }

  const handleUpdated = (updated) => {
    setSchedules(prev =>
      prev.map(s => s.id === updated.id ? updated : s)
          .sort((a, b) => a.date.localeCompare(b.date))
    )
  }

  const handleDelete = async (id) => {
    if (!window.confirm('이 일정을 삭제하시겠습니까?')) return
    setDeletingId(id)
    const { error: err } = await deleteSchedule(id)
    setDeletingId(null)
    if (err) { console.error(err); return }
    setSchedules(prev => prev.filter(s => s.id !== id))
  }

  const ScheduleItem = ({ s }) => {
    const isPast = s.date < today
    const isToday = s.date === today
    const companyName = s.customer?.company ?? ''
    const isDeleting = deletingId === s.id
    return (
      <div style={{
        display: 'flex', gap: 12, padding: isMobile ? '12px 14px' : '14px 18px',
        borderBottom: `1px solid ${C.line}`,
        opacity: isPast ? 0.55 : 1,
        alignItems: 'flex-start',
      }}>
        <div style={{ minWidth: 80, textAlign: 'center', flexShrink: 0 }}>
          <div style={{ fontSize: 11, color: C.sub }}>{s.date.slice(5).replace('-', '/')}</div>
          {isToday && <div style={{ fontSize: 10, fontWeight: 700, color: C.gold }}>오늘</div>}
        </div>
        <div style={{ width: 4, borderRadius: 2, background: TYPE_COLOR[s.type] || C.sub, flexShrink: 0, alignSelf: 'stretch', minHeight: 20 }} />
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
            <span style={{ fontSize: 11, padding: '1px 6px', borderRadius: 999, background: (TYPE_COLOR[s.type] || C.sub) + '33', color: TYPE_COLOR[s.type] || C.sub, fontWeight: 700 }}>{s.type}</span>
            <span style={{ fontWeight: 600, color: C.text, fontSize: 13 }}>{s.title}</span>
          </div>
          {s.memo && <div style={{ fontSize: 12, color: C.sub }}>{s.memo}</div>}
          {companyName && <div style={{ fontSize: 11, color: C.sub, marginTop: 2 }}>고객사: {companyName}</div>}
        </div>
        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
          <button
            onClick={() => setEditingSchedule(s)}
            style={{
              padding: '2px 8px', borderRadius: 6, border: `1px solid ${C.line}`,
              background: 'transparent', color: C.sub, fontSize: 11, cursor: 'pointer',
            }}
          >수정</button>
          <button
            onClick={() => handleDelete(s.id)}
            disabled={isDeleting}
            style={{
              padding: '2px 8px', borderRadius: 6, border: `1px solid ${C.line}`,
              background: 'transparent', color: C.sub, fontSize: 11, cursor: isDeleting ? 'not-allowed' : 'pointer',
              opacity: isDeleting ? 0.5 : 1,
            }}
          >{isDeleting ? '...' : '삭제'}</button>
        </div>
      </div>
    )
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
        <h3 style={{ margin: 0, color: C.text }}>일정 관리</h3>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {isAdmin && (
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
              {/* 모바일에서는 '전체보기' 축약 */}
              <button
                onClick={() => { setViewAll(v => !v); setConsultantViewFilter('') }}
                style={{
                  padding: '7px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600,
                  border: `1px solid ${viewAll ? C.gold : C.line}`,
                  background: viewAll ? C.gold + '22' : 'transparent',
                  color: viewAll ? C.gold : C.sub,
                  minHeight: isMobile ? 44 : undefined,
                }}
              >
                {isMobile
                  ? (viewAll ? '내 일정' : '전체보기')
                  : (viewAll ? '내 일정 보기' : '워크스페이스 전체보기')}
              </button>
            </>
          )}
          <button
            onClick={() => setShowCreate(true)}
            style={{
              padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
              background: 'linear-gradient(135deg, #f0b840, #d4952a)', color: '#03060d', fontWeight: 700, fontSize: 13,
              minHeight: isMobile ? 44 : undefined,
            }}
          >+ 일정 추가</button>
        </div>
      </div>

      {/* 필터 바: 모바일에서 가로 스크롤 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: isMobile ? 'nowrap' : 'wrap', overflowX: isMobile ? 'auto' : undefined, WebkitOverflowScrolling: 'touch', paddingBottom: isMobile ? 2 : 0 }}>
        {types.map(t => (
          <button key={t} onClick={() => setSelectedType(t)} style={{
            padding: '4px 12px', borderRadius: 999, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
            flexShrink: 0,
            background: selectedType === t ? (TYPE_COLOR[t] || C.gold) : C.s3,
            color: selectedType === t ? '#fff' : C.sub,
          }}>{t}</button>
        ))}
      </div>

      <div style={{ background: C.s2, border: `1px solid ${C.line}`, borderRadius: 14, overflow: 'hidden' }}>
        <div style={{ padding: '10px 16px', background: C.s3, borderBottom: `1px solid ${C.line}` }}>
          <span style={{ fontWeight: 700, color: C.text, fontSize: 13 }}>예정 일정</span>
          <span style={{ marginLeft: 8, fontSize: 12, color: C.sub }}>{upcoming.length}건</span>
        </div>
        {upcoming.length === 0
          ? <div style={{ padding: 24, textAlign: 'center', color: C.sub }}>예정 일정이 없습니다. 일정을 추가해보세요!</div>
          : upcoming.map(s => <ScheduleItem key={s.id} s={s} />)
        }
        {past.length > 0 && (
          <>
            <div style={{ padding: '10px 16px', background: C.s3, borderBottom: `1px solid ${C.line}`, borderTop: `1px solid ${C.line}` }}>
              <span style={{ fontWeight: 700, color: C.sub, fontSize: 13 }}>지난 일정</span>
              <span style={{ marginLeft: 8, fontSize: 12, color: C.sub }}>{past.length}건</span>
            </div>
            {past.map(s => <ScheduleItem key={s.id} s={s} />)}
          </>
        )}
        {scopedSchedules.length === 0 && (
          <div style={{ padding: 32, textAlign: 'center', color: C.sub }}>
            아직 등록된 일정이 없습니다. 첫 일정을 추가해보세요!
          </div>
        )}
      </div>

      {showCreate && (
        <CreateSchedulePanel
          onClose={() => setShowCreate(false)}
          onCreated={handleCreated}
          profile={profile}
        />
      )}

      {editingSchedule && (
        <EditSchedulePanel
          schedule={editingSchedule}
          onClose={() => setEditingSchedule(null)}
          onUpdated={(updated) => { handleUpdated(updated); setEditingSchedule(null) }}
        />
      )}
    </div>
  )
}
