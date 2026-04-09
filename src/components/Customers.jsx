import { useState, useEffect, useRef } from 'react'
import { useT, useIsMobile } from '../theme.jsx'
import { Button, BottomSheet } from './Common.jsx'
import CustomerDetailPanel, { STATUS_CONFIG } from './customers/CustomerDetailPanel.jsx'
import { supabase, getCustomers, deleteCustomer, createCustomer, createAssignmentNotification } from '../supabase.js'

const STATUS_LIST = Object.keys(STATUS_CONFIG)
const STATUS_FILTERS = ['전체', ...STATUS_LIST]

// ─── 리스트용 상태 배지 (STATUS_CONFIG 색상 적용) ────────────────────────────
function StatusBadge({ status }) {
  if (!status) return <span style={{ color: '#6b84a8', fontSize: 12 }}>-</span>
  const cfg = STATUS_CONFIG[status] ?? { bg: '#6b728022', color: '#6b7280', border: '#6b728044' }
  return (
    <span style={{
      display: 'inline-block', padding: '2px 10px', borderRadius: 999,
      fontSize: 11, fontWeight: 700,
      background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`,
      whiteSpace: 'nowrap',
    }}>
      {status}
    </span>
  )
}

// ─── 모바일 카드 (테이블 대체) ────────────────────────────────────────────────
function CustomerMobileCard({ c, onSelect, C }) {
  return (
    <div
      onClick={() => onSelect(c)}
      style={{
        background: C.s2, border: `1px solid ${C.line}`,
        borderRadius: 12, padding: '14px 16px',
        cursor: 'pointer', marginBottom: 8,
      }}
    >
      {/* 1행: 상태 배지 + 회사명 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <StatusBadge status={c.status} />
        <span style={{
          fontSize: 15, fontWeight: 700, color: C.text,
          flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{c.company}</span>
        {c.pool && (
          <span style={{
            fontSize: 10, fontWeight: 700, color: '#4d9eff',
            border: '1px solid #1d6fe840', borderRadius: 4, padding: '1px 5px',
          }}>POOL</span>
        )}
      </div>
      {/* 2행: 대표 + 업종 + 담당자 */}
      <div style={{ display: 'flex', gap: 12, fontSize: 12, color: C.sub, marginBottom: 4 }}>
        <span>{c.ceo || '-'}</span>
        <span>{c.industry || '-'}</span>
        <span style={{ marginLeft: 'auto' }}>담당: {c.consultantName || '미배분'}</span>
      </div>
      {/* 3행: 간단메모 */}
      {c.quick_memo && (
        <div style={{
          fontSize: 11, color: C.sub, marginTop: 4,
          overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
        }}>
          {c.quick_memo}
        </div>
      )}
      {/* 4행: 태그 */}
      {c.tags?.length > 0 && (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
          {c.tags.slice(0, 2).map(tag => (
            <span key={tag} style={{
              fontSize: 10, color: C.sub,
              background: C.s3, borderRadius: 4, padding: '1px 6px',
            }}>{tag}</span>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── 고객사 등록 패널 ─────────────────────────────────────────────────────────
function CustomerRegisterPanel({ consultants, profile, onClose, onCreated, isMobile }) {
  const C = useT()
  const [form, setForm] = useState({
    company: '', ceo: '', industry: '', consultant: '', status: STATUS_LIST[0] ?? '신규',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const set = (key, val) => setForm(prev => ({ ...prev, [key]: val }))

  const handleSubmit = async () => {
    if (!form.company.trim()) { setError('회사명은 필수입니다.'); return }
    setSaving(true)
    setError('')

    const workspaceId = profile?.workspace?.id || profile?.workspace_id
    const payload = {
      workspace_id: workspaceId,
      company: form.company.trim(),
      ceo: form.ceo.trim() || null,
      industry: form.industry.trim() || null,
      consultant: form.consultant || null,
      status: form.status || null,
      pool: false,
      tags: [],
      score: 0,
    }

    const { data, error: err } = await createCustomer(payload)
    setSaving(false)
    if (err) { console.error('createCustomer error:', err); setError('저장 중 오류가 발생했습니다.'); return }
    onCreated(data)
    onClose()
  }

  const inputStyle = {
    width: '100%', padding: '9px 12px', borderRadius: 8, outline: 'none',
    background: C.s3, border: `1px solid ${C.line}`, color: C.text,
    fontSize: 13, boxSizing: 'border-box',
  }
  const labelStyle = { fontSize: 11, fontWeight: 700, color: C.sub, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 5, display: 'block' }

  // 폼 필드 — BottomSheet와 슬라이드 패널에서 공통 사용
  const formFields = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div><label style={labelStyle}>업체명 *</label><input style={inputStyle} value={form.company} onChange={e => set('company', e.target.value)} placeholder="(주)그린테크" /></div>
      <div><label style={labelStyle}>대표자 이름</label><input style={inputStyle} value={form.ceo} onChange={e => set('ceo', e.target.value)} placeholder="홍길동" /></div>
      <div><label style={labelStyle}>업종</label><input style={inputStyle} value={form.industry} onChange={e => set('industry', e.target.value)} placeholder="제조업" /></div>
      <div>
        <label style={labelStyle}>담당자</label>
        <select style={inputStyle} value={form.consultant} onChange={e => set('consultant', e.target.value)}>
          <option value="">미배분</option>
          {consultants.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </div>
      <div>
        <label style={labelStyle}>상태</label>
        <select style={inputStyle} value={form.status} onChange={e => set('status', e.target.value)}>
          {STATUS_LIST.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      {error && <div style={{ fontSize: 12, color: C.error }}>{error}</div>}
      <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
        <button onClick={onClose} style={{ flex: 1, padding: '10px', borderRadius: 8, border: `1px solid ${C.line}`, background: 'transparent', color: C.sub, fontSize: 13, cursor: 'pointer' }}>취소</button>
        <button onClick={handleSubmit} disabled={saving} style={{ flex: 2, padding: '10px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg, #f0b840, #d4952a)', color: '#03060d', fontSize: 13, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
          {saving ? '저장 중...' : '고객사 등록'}
        </button>
      </div>
    </div>
  )

  // 모바일: BottomSheet
  if (isMobile) {
    return (
      <BottomSheet open onClose={onClose} title="고객사 등록">
        <div style={{ padding: '16px 20px 20px' }}>
          {formFields}
        </div>
      </BottomSheet>
    )
  }

  // 데스크탑: 오른쪽 슬라이드 패널
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(3,6,13,0.6)', zIndex: 100 }} />
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: 380,
        background: C.s2, borderLeft: `1px solid ${C.line}`,
        zIndex: 101, display: 'flex', flexDirection: 'column',
        boxShadow: '-8px 0 40px rgba(0,0,0,0.4)',
      }}>
        <div style={{ padding: '20px 24px', borderBottom: `1px solid ${C.line}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: C.text }}>고객사 등록</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: C.sub, fontSize: 20, cursor: 'pointer' }}>×</button>
        </div>
        <div style={{ padding: '20px 24px', flex: 1, overflowY: 'auto' }}>
          {formFields}
        </div>
      </div>
    </>
  )
}

export default function Customers({ consultantFilter, profile }) {
  const C = useT()
  const isMobile = useIsMobile()
  const [customers, setCustomers] = useState([])
  const [consultants, setConsultants] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('전체')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(null)
  const panelRef = useRef(null)
  const [showRegister, setShowRegister] = useState(false)
  const [colorRows, setColorRows] = useState(true)
  const [hoveredId, setHoveredId] = useState(null)
  // consultants 최신값을 Realtime 핸들러에서 참조하기 위한 ref
  const consultantsRef = useRef([])
  useEffect(() => { consultantsRef.current = consultants }, [consultants])

  // 담당자 인라인 편집
  const [editingConsultantId, setEditingConsultantId] = useState(null)
  const [savingConsultantId, setSavingConsultantId] = useState(null)
  const consultantSelectRef = useRef(null)
  // 상태 인라인 편집
  const [editingStatusId, setEditingStatusId] = useState(null)
  const [savingStatusId, setSavingStatusId] = useState(null)
  const statusSelectRef = useRef(null)
  // 간단메모 인라인 편집
  const [editingMemoId, setEditingMemoId] = useState(null)
  const [memoValues, setMemoValues] = useState({})
  const [savingMemoId, setSavingMemoId] = useState(null)
  const [savedMemoId, setSavedMemoId] = useState(null)
  const memoInputRef = useRef(null)

  // Realtime UPDATE 핸들러에서 편집 중 필드를 보호하기 위한 refs
  const editingMemoIdRef = useRef(null)
  const editingStatusIdRef = useRef(null)
  const editingConsultantIdRef = useRef(null)
  useEffect(() => { editingMemoIdRef.current = editingMemoId }, [editingMemoId])
  useEffect(() => { editingStatusIdRef.current = editingStatusId }, [editingStatusId])
  useEffect(() => { editingConsultantIdRef.current = editingConsultantId }, [editingConsultantId])
  // 재연결 감지용 ref
  const realtimeSubscribedRef = useRef(false)

  const loadData = async () => {
    setLoading(true)
    try {
      const [custRes, membersRes] = await Promise.all([
        getCustomers(),
        supabase.from('profiles').select('id, name, role, created_at').eq('approval_status', 'approved'),
      ])
      if (custRes.error) console.error('getCustomers error:', custRes.error)
      if (membersRes.error) console.error('profiles error:', membersRes.error)
      const sortedMembers = (membersRes.data ?? []).slice().sort((a, b) => {
        const roleOrder = r => (r === 'admin' || r === 'superadmin') ? 0 : 1
        const ro = roleOrder(a.role) - roleOrder(b.role)
        if (ro !== 0) return ro
        return new Date(a.created_at) - new Date(b.created_at)
      })
      const memberMap = {}
      sortedMembers.forEach(m => { memberMap[m.id] = m.name })
      const enriched = (custRes.data ?? []).map(c => ({
        ...c,
        consultantName: memberMap[c.consultant] || '-',
      }))
      setCustomers(enriched)
      setConsultants(sortedMembers)
    } catch (err) {
      console.error('loadData exception:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, [])

  // ── customers 테이블 Realtime 구독 ───────────────────────────────────────────
  // 의존성을 profile 객체 전체가 아닌 workspaceId 문자열로 고정:
  // profile 객체 참조가 바뀔 때마다 채널이 teardown→reconnect되는 race condition 방지
  const _workspaceIdForRealtime = profile?.workspace?.id || profile?.workspace_id
  useEffect(() => {
    const workspaceId = _workspaceIdForRealtime
    if (!workspaceId) return

    const getMemberName = (consultantId) =>
      consultantsRef.current.find(m => m.id === consultantId)?.name || '-'

    let retryTimer = null
    let ch = null

    const subscribe = () => {
      supabase.auth.getSession().then(({ data: { session: s } }) => {
        if (s?.access_token) supabase.realtime.setAuth(s.access_token)
      }).catch(() => {})

      ch = supabase
        .channel(`customers:${workspaceId}`)
      .on('postgres_changes', {
          event: 'INSERT', schema: 'public', table: 'customers',
        }, (payload) => {
          if (payload.new.workspace_id !== workspaceId) return
          setCustomers(prev => {
            if (prev.some(c => c.id === payload.new.id)) return prev
            return [{ ...payload.new, consultantName: getMemberName(payload.new.consultant) }, ...prev]
          })
        })
        .on('postgres_changes', {
          event: 'UPDATE', schema: 'public', table: 'customers',
        }, (payload) => {
          if (payload.new.workspace_id !== workspaceId) return
          const updated = payload.new
          setCustomers(prev => prev.map(c => {
            if (c.id !== updated.id) return c
            const merged = { ...c, ...updated, consultantName: getMemberName(updated.consultant) }
            if (editingMemoIdRef.current === updated.id) merged.quick_memo = c.quick_memo
            if (editingStatusIdRef.current === updated.id) merged.status = c.status
            if (editingConsultantIdRef.current === updated.id) {
              merged.consultant = c.consultant
              merged.consultantName = c.consultantName
            }
            return merged
          }))
          setSelected(prev => {
            if (prev?.id !== updated.id) return prev
            const merged = { ...prev, ...updated, consultantName: getMemberName(updated.consultant) }
            if (editingMemoIdRef.current === updated.id) merged.quick_memo = prev.quick_memo
            if (editingStatusIdRef.current === updated.id) merged.status = prev.status
            if (editingConsultantIdRef.current === updated.id) {
              merged.consultant = prev.consultant
              merged.consultantName = prev.consultantName
            }
            return merged
          })
        })
        .subscribe((status, err) => {
          if (status === 'SUBSCRIBED') {
            if (realtimeSubscribedRef.current) {
              console.debug('[Realtime] customers 재연결, 데이터 재로드')
              loadData()
            } else {
              realtimeSubscribedRef.current = true
              console.debug('[Realtime] customers 구독 완료')
            }
          }
          if (status === 'CHANNEL_ERROR') {
            console.warn('[Realtime] customers 구독 오류', err ?? '(err=undefined: WebSocket 연결 실패 — Vercel 환경변수 또는 Supabase Realtime 활성화 여부 확인)', '— 30초 후 재시도')
            retryTimer = setTimeout(() => {
              supabase.removeChannel(ch)
              subscribe()
            }, 30000)
          }
          if (status === 'TIMED_OUT') console.warn('[Realtime] customers 구독 타임아웃')
        })
    } // end subscribe()

    subscribe()
    return () => {
      clearTimeout(retryTimer)
      if (ch) supabase.removeChannel(ch)
    }
  }, [_workspaceIdForRealtime]) // workspaceId가 실제로 바뀔 때만 재구독

  // 담당자 드롭다운 외부 클릭 시 닫기
  useEffect(() => {
    if (!editingConsultantId) return
    const handleClickOutside = (e) => {
      if (consultantSelectRef.current && !consultantSelectRef.current.contains(e.target)) {
        setEditingConsultantId(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [editingConsultantId])

  // 상태 드롭다운 외부 클릭 시 닫기
  useEffect(() => {
    if (!editingStatusId) return
    const handleClickOutside = (e) => {
      if (statusSelectRef.current && !statusSelectRef.current.contains(e.target)) {
        setEditingStatusId(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [editingStatusId])

  const handleConsultantChange = async (customerId, newConsultantId, companyName) => {
    setSavingConsultantId(customerId)
    setEditingConsultantId(null)
    const { error } = await supabase
      .from('customers')
      .update({ consultant: newConsultantId || null })
      .eq('id', customerId)
    if (!error) {
      const newName = consultants.find(m => m.id === newConsultantId)?.name || '-'
      setCustomers(prev => prev.map(c =>
        c.id === customerId ? { ...c, consultant: newConsultantId || null, consultantName: newName } : c
      ))
      // 선택된 패널도 갱신
      if (selected?.id === customerId) {
        setSelected(prev => ({ ...prev, consultant: newConsultantId || null, consultantName: newName }))
      }
      // 알림 전송 (admin/superadmin만, 담당자가 지정된 경우만)
      if (newConsultantId && (profile?.role === 'admin' || profile?.role === 'superadmin')) {
        try {
          await createAssignmentNotification({
            workspaceId: profile?.workspace?.id,
            userId: newConsultantId,
            customerCompany: companyName,
            assignerName: profile?.name || '관리자',
          })
        } catch {
          // 알림 실패는 무시
        }
      }
    } else {
      console.error('담당자 변경 오류:', error)
    }
    setSavingConsultantId(null)
  }

  const handleStatusChange = async (customerId, newStatus) => {
    setSavingStatusId(customerId)
    setEditingStatusId(null)
    const { error } = await supabase
      .from('customers')
      .update({ status: newStatus || null })
      .eq('id', customerId)
    if (!error) {
      setCustomers(prev => prev.map(c =>
        c.id === customerId ? { ...c, status: newStatus || null } : c
      ))
      if (selected?.id === customerId) {
        setSelected(prev => ({ ...prev, status: newStatus || null }))
      }
    } else {
      console.error('상태 변경 오류:', error)
    }
    setSavingStatusId(null)
  }

  const handleMemoSave = async (customerId, value) => {
    const trimmed = (value || '').trim()
    const current = (customers.find(c => c.id === customerId)?.quick_memo || '').trim()
    setEditingMemoId(null)
    if (trimmed === current) return
    setSavingMemoId(customerId)
    const { error } = await supabase
      .from('customers')
      .update({ quick_memo: trimmed || null })
      .eq('id', customerId)
    if (!error) {
      setCustomers(prev => prev.map(c =>
        c.id === customerId ? { ...c, quick_memo: trimmed || null } : c
      ))
      if (selected?.id === customerId) {
        setSelected(prev => ({ ...prev, quick_memo: trimmed || null }))
      }
      setSavedMemoId(customerId)
      setTimeout(() => setSavedMemoId(null), 1500)
    } else {
      console.error('간단메모 저장 오류:', error)
    }
    setSavingMemoId(null)
  }

  const filtered = customers.filter(c => {
    const matchStatus = filter === '전체' || c.status === filter
    const q = search.toLowerCase()
    const matchSearch = !search ||
      (c.company || '').toLowerCase().includes(q) ||
      (c.ceo || '').toLowerCase().includes(q) ||
      (c.industry || '').toLowerCase().includes(q) ||
      (c.phone || '').includes(search)
    const matchConsultant = !consultantFilter || c.consultant === consultantFilter
    return matchStatus && matchSearch && matchConsultant
  })

  const th = { textAlign: 'left', padding: '8px 12px', color: C.sub, fontSize: 11, fontWeight: 700, borderBottom: `1px solid ${C.line}`, whiteSpace: 'nowrap', letterSpacing: '0.04em' }
  const td = { padding: '10px 12px', color: C.text, fontSize: 13, borderBottom: `1px solid ${C.line}`, whiteSpace: 'nowrap' }

  const getRowBg = (c) => {
    if (selected?.id === c.id) return C.s3
    if (hoveredId === c.id) return C.s3
    if (colorRows && c.status) {
      const cfg = STATUS_CONFIG[c.status]
      if (cfg) return cfg.bg  // STATUS_CONFIG의 반투명 배경색
    }
    return ''
  }

  const handleUpdate = (updated) => {
    const consultantName = consultants.find(m => m.id === updated.consultant)?.name || '-'
    const enriched = { ...updated, consultantName }
    setCustomers(prev => prev.map(c => c.id === updated.id ? enriched : c))
    setSelected(enriched)
  }

  const handleCreated = (newCustomer) => {
    const memberMap = {}
    consultants.forEach(m => { memberMap[m.id] = m.name })
    const enriched = { ...newCustomer, consultantName: memberMap[newCustomer.consultant] || '-' }
    setCustomers(prev => [enriched, ...prev])
  }

  const [deleteConfirm, setDeleteConfirm] = useState(null) // { id, company }
  const [deleting, setDeleting] = useState(false)

  const handleDelete = (e, c) => {
    e.stopPropagation()
    setDeleteConfirm({ id: c.id, company: c.company })
  }

  const confirmDelete = async () => {
    if (!deleteConfirm) return
    setDeleting(true)
    const { error } = await deleteCustomer(deleteConfirm.id)
    setDeleting(false)
    if (error) {
      console.error('deleteCustomer error:', error)
      alert('삭제 중 오류가 발생했습니다.')
    } else {
      setCustomers(prev => prev.filter(c => c.id !== deleteConfirm.id))
      if (selected?.id === deleteConfirm.id) setSelected(null)
    }
    setDeleteConfirm(null)
  }

  useEffect(() => {
    if (!deleteConfirm) return
    const handler = (e) => {
      if (e.key === 'Enter' && !deleting) confirmDelete()
      if (e.key === 'Escape' && !deleting) setDeleteConfirm(null)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [deleteConfirm, deleting])

  const isAdmin = profile?.role === 'admin' || profile?.role === 'superadmin'

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ margin: 0, color: C.text }}>{consultantFilter ? '내 고객사' : '고객사 관리'}</h3>
        <Button variant="primary" onClick={() => setShowRegister(true)}>+ 고객사 등록</Button>
      </div>

      {/* 상태 필터 */}
      <div style={{
        display: 'flex',
        flexWrap: isMobile ? 'nowrap' : 'wrap',
        overflowX: isMobile ? 'auto' : undefined,
        WebkitOverflowScrolling: 'touch',
        gap: 6, marginBottom: isMobile ? 10 : 14,
        paddingBottom: isMobile ? 4 : 0,
      }}>
        {STATUS_FILTERS.map(s => (
          <button key={s} onClick={() => setFilter(s)} style={{
            padding: '3px 10px', borderRadius: 999, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 700,
            flexShrink: 0,
            background: filter === s ? C.gold : C.s3,
            color: filter === s ? C.base : C.sub,
          }}>{s}</button>
        ))}
        {/* 검색 + 색상 토글 — 모바일에서는 필터 아래 별도 행으로 */}
        {!isMobile && (
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', userSelect: 'none' }}>
              <input
                type="checkbox"
                checked={colorRows}
                onChange={e => setColorRows(e.target.checked)}
                style={{ cursor: 'pointer', accentColor: C.gold, width: 14, height: 14 }}
              />
              <span style={{ fontSize: 11, color: C.sub, whiteSpace: 'nowrap' }}>상태 색상</span>
            </label>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="업체명·이름·연락처 검색"
              style={{ padding: '4px 12px', borderRadius: 8, border: `1px solid ${C.line}`, background: C.s3, color: C.text, fontSize: 12, width: 180, outline: 'none' }} />
          </div>
        )}
      </div>
      {/* 모바일 전용 검색 바 */}
      {isMobile && (
        <>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="업체명·이름·연락처 검색"
            style={{
              display: 'block', width: '100%', boxSizing: 'border-box',
              padding: '8px 12px', borderRadius: 8,
              border: `1px solid ${C.line}`, background: C.s3,
              color: C.text, fontSize: 13, outline: 'none', marginBottom: 8,
            }}
          />
          {/* 상태 색상 체크박스 — 모바일에서도 표시 */}
          <label style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            cursor: 'pointer', userSelect: 'none', marginBottom: 12,
          }}>
            <input
              type="checkbox"
              checked={colorRows}
              onChange={e => setColorRows(e.target.checked)}
              style={{ cursor: 'pointer', accentColor: C.gold, width: 16, height: 16 }}
            />
            <span style={{ fontSize: 12, color: C.sub }}>상태 색상</span>
          </label>
        </>
      )}

      {/* 모바일: 카드 리스트 / 데스크탑: 테이블 */}
      {isMobile ? (
        <div>
          {loading ? (
            <div style={{ padding: 32, textAlign: 'center', color: C.sub }}>불러오는 중...</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 32, textAlign: 'center', color: C.sub }}>검색 결과가 없습니다.</div>
          ) : (
            filtered.map(c => (
              <CustomerMobileCard key={c.id} c={c} onSelect={setSelected} C={C} />
            ))
          )}
        </div>
      ) : (
        <div style={{ background: C.s2, border: `1px solid ${C.line}`, borderRadius: 14, overflow: 'auto' }}>
          {loading ? (
            <div style={{ padding: 32, textAlign: 'center', color: C.sub }}>불러오는 중...</div>
          ) : (
            <table style={{ width: '100%', minWidth: isAdmin ? 960 : 920, borderCollapse: 'collapse', tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: 70 }} />
                <col style={{ width: 80 }} />
                <col style={{ width: 130 }} />
                <col style={{ width: 90 }} />
                <col style={{ width: 110 }} />
                <col style={{ width: 100 }} />
                <col style={{ width: 80 }} />
                <col style={{ width: 180 }} />
                <col style={{ width: 80 }} />
                {isAdmin && <col style={{ width: 40 }} />}
              </colgroup>
              <thead>
                <tr style={{ background: C.s1 }}>
                  <th style={{ ...th, width: 70, minWidth: 70 }}>상태</th>
                  <th style={{ ...th, width: 80, minWidth: 80 }}>담당자</th>
                  <th style={{ ...th, width: 130, minWidth: 130 }}>업체명</th>
                  <th style={{ ...th, width: 90, minWidth: 90 }}>이름</th>
                  <th style={{ ...th, width: 110, minWidth: 110 }}>연락처</th>
                  <th style={{ ...th, width: 100, minWidth: 100 }}>업종</th>
                  <th style={{ ...th, width: 80, minWidth: 80 }}>유입경로</th>
                  <th style={{ ...th, width: 180, minWidth: 180 }}>빠른 메모</th>
                  <th style={{ ...th, width: 80, minWidth: 80 }}>접수일</th>
                  {isAdmin && <th style={{ ...th, width: 40, minWidth: 40, textAlign: 'center' }}></th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map(c => {
                  const ellipsis = { overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', display: 'block' }
                  return (
                  <tr
                    key={c.id}
                    style={{ cursor: 'pointer', background: getRowBg(c), transition: 'background 0.1s' }}
                    onClick={() => setSelected(c)}
                    onMouseEnter={() => setHoveredId(c.id)}
                    onMouseLeave={() => setHoveredId(null)}
                  >
                    {/* 상태 */}
                    <td
                      style={{ ...td, width: 70, minWidth: 70, maxWidth: 70, cursor: 'pointer', position: 'relative' }}
                      onClick={e => {
                        e.stopPropagation()
                        setEditingStatusId(c.id)
                      }}
                    >
                      {savingStatusId === c.id ? (
                        <span style={{ fontSize: 11, color: C.gold }}>저장 중...</span>
                      ) : editingStatusId === c.id ? (
                        <div ref={statusSelectRef} onClick={e => e.stopPropagation()}>
                          <select
                            autoFocus
                            defaultValue={c.status ?? ''}
                            onChange={e => handleStatusChange(c.id, e.target.value)}
                            style={{
                              padding: '4px 6px', borderRadius: 6, outline: 'none',
                              background: C.s3, border: `1px solid ${C.gold}`,
                              color: C.text, fontSize: 12, cursor: 'pointer',
                            }}
                          >
                            <option value="">상태 없음</option>
                            {STATUS_LIST.map(s => (
                              <option key={s} value={s}>{s}</option>
                            ))}
                          </select>
                        </div>
                      ) : (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                          <StatusBadge status={c.status} />
                          <span style={{ fontSize: 9, color: C.sub, lineHeight: 1 }}>▼</span>
                        </span>
                      )}
                    </td>
                    {/* 담당자 */}
                    <td
                      style={{ ...td, width: 80, minWidth: 80, maxWidth: 80, color: C.sub, cursor: 'pointer', position: 'relative' }}
                      onClick={e => {
                        e.stopPropagation()
                        setEditingConsultantId(c.id)
                      }}
                    >
                      {savingConsultantId === c.id ? (
                        <span style={{ fontSize: 11, color: C.gold }}>저장 중...</span>
                      ) : editingConsultantId === c.id ? (
                        <div ref={consultantSelectRef} onClick={e => e.stopPropagation()}>
                          <select
                            autoFocus
                            defaultValue={c.consultant ?? ''}
                            onChange={e => handleConsultantChange(c.id, e.target.value, c.company)}
                            style={{
                              padding: '4px 6px', borderRadius: 6, outline: 'none',
                              background: C.s3, border: `1px solid ${C.gold}`,
                              color: C.text, fontSize: 12, cursor: 'pointer',
                            }}
                          >
                            <option value="">미배분</option>
                            {consultants.map(m => (
                              <option key={m.id} value={m.id}>{m.name}</option>
                            ))}
                          </select>
                        </div>
                      ) : (
                        <span title={c.consultantName} style={{ ...ellipsis, borderBottom: `1px dashed ${C.line}`, paddingBottom: 1 }}>
                          {c.consultantName}
                        </span>
                      )}
                    </td>
                    {/* 업체명 */}
                    <td style={{ ...td, width: 130, minWidth: 130, maxWidth: 130 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, overflow: 'hidden' }}>
                        <span title={c.company} style={{ fontWeight: 600, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', display: 'block', minWidth: 0, flex: 1 }}>{c.company}</span>
                        {c.pool && <span style={{ flexShrink: 0, fontSize: 10, padding: '1px 6px', borderRadius: 999, background: C.blue, color: C.base }}>풀</span>}
                      </div>
                    </td>
                    {/* 이름 */}
                    <td style={{ ...td, width: 90, minWidth: 90, maxWidth: 90 }}>
                      <span title={c.ceo || undefined} style={ellipsis}>{c.ceo || '-'}</span>
                    </td>
                    {/* 연락처 */}
                    <td style={{ ...td, width: 110, minWidth: 110, maxWidth: 110, color: C.sub }}>
                      <span title={c.phone || undefined} style={ellipsis}>{c.phone || '-'}</span>
                    </td>
                    {/* 업종 */}
                    <td style={{ ...td, width: 100, minWidth: 100, maxWidth: 100, color: C.sub }}>
                      <span title={c.industry || undefined} style={ellipsis}>{c.industry || '-'}</span>
                    </td>
                    {/* 유입경로 */}
                    <td style={{ ...td, width: 80, minWidth: 80, maxWidth: 80, color: C.sub }}>
                      <span title={c.lead_source || undefined} style={ellipsis}>{c.lead_source || '-'}</span>
                    </td>
                    {/* 간단메모 */}
                    <td
                      style={{ ...td, width: 180, minWidth: 180, maxWidth: 180, cursor: 'text', position: 'relative' }}
                      onClick={e => {
                        e.stopPropagation()
                        if (editingMemoId !== c.id) {
                          setMemoValues(prev => ({ ...prev, [c.id]: c.quick_memo || '' }))
                          setEditingMemoId(c.id)
                        }
                      }}
                    >
                      {savingMemoId === c.id ? (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span style={{ ...ellipsis, fontSize: 12, color: C.sub, flex: 1 }}>{c.quick_memo || ''}</span>
                          <span style={{ fontSize: 10, color: C.gold, flexShrink: 0 }}>저장 중</span>
                        </span>
                      ) : editingMemoId === c.id ? (
                        <input
                          ref={memoInputRef}
                          autoFocus
                          maxLength={80}
                          value={memoValues[c.id] ?? ''}
                          onChange={e => setMemoValues(prev => ({ ...prev, [c.id]: e.target.value }))}
                          onKeyDown={e => {
                            if (e.key === 'Enter') { e.preventDefault(); handleMemoSave(c.id, memoValues[c.id] ?? '') }
                            if (e.key === 'Escape') { e.stopPropagation(); setEditingMemoId(null) }
                          }}
                          onBlur={() => handleMemoSave(c.id, memoValues[c.id] ?? '')}
                          onClick={e => e.stopPropagation()}
                          onMouseDown={e => e.stopPropagation()}
                          placeholder="빠른 메모 입력..."
                          style={{
                            width: '100%', boxSizing: 'border-box',
                            padding: '3px 6px', borderRadius: 5, outline: 'none',
                            background: C.s3, border: `1px solid ${C.gold}`,
                            color: C.text, fontSize: 12,
                          }}
                        />
                      ) : (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span
                            title={c.quick_memo?.trim() || undefined}
                            style={{
                              ...ellipsis, flex: 1,
                              color: c.quick_memo?.trim() ? C.text : C.sub,
                              fontSize: 12,
                              borderBottom: `1px dashed ${C.line}`,
                              paddingBottom: 1,
                            }}
                          >
                            {c.quick_memo?.trim() || '-'}
                          </span>
                          {savedMemoId === c.id && (
                            <span style={{ fontSize: 11, color: C.green, flexShrink: 0, animation: 'none' }}>✓</span>
                          )}
                        </span>
                      )}
                    </td>
                    {/* 접수일 */}
                    <td style={{ ...td, width: 80, minWidth: 80, maxWidth: 80, color: C.sub }}>
                      <span title={c.received_date || undefined} style={ellipsis}>{c.received_date || '-'}</span>
                    </td>
                    {/* 삭제버튼 */}
                    {isAdmin && (
                      <td style={{ ...td, width: 40, minWidth: 40, maxWidth: 40, textAlign: 'center', padding: '10px 4px' }} onClick={e => e.stopPropagation()}>
                        <button
                          onClick={e => handleDelete(e, c)}
                          title="고객사 삭제"
                          style={{
                            background: 'none', border: 'none', cursor: 'pointer',
                            color: '#dc3545', fontSize: 17, padding: '2px 4px', borderRadius: 4,
                            lineHeight: 1, transition: 'opacity 0.15s',
                          }}
                          onMouseEnter={e => { e.currentTarget.style.opacity = '0.7' }}
                          onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}
                        >🗑</button>
                      </td>
                    )}
                  </tr>
                  )
                })}
              </tbody>
            </table>
          )}
          {!loading && filtered.length === 0 && (
            <div style={{ padding: 32, textAlign: 'center', color: C.sub }}>검색 결과가 없습니다.</div>
          )}
        </div>
      )}
      <div style={{ marginTop: 8, color: C.sub, fontSize: 12 }}>총 {filtered.length}개 고객사</div>

      {showRegister && (
        <CustomerRegisterPanel
          consultants={consultants}
          profile={profile}
          isMobile={isMobile}
          onClose={() => setShowRegister(false)}
          onCreated={handleCreated}
        />
      )}

      {deleteConfirm && (
        <>
          <div onClick={() => !deleting && setDeleteConfirm(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(3,6,13,0.7)', zIndex: 200 }} />
          <div style={{
            position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
            background: '#0b1224', border: '1px solid #1c2b44', borderRadius: 14,
            padding: '28px 32px', zIndex: 201, width: 360, boxShadow: '0 8px 40px rgba(0,0,0,0.6)',
          }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#eaf0ff', marginBottom: 10 }}>고객사 삭제</div>
            <div style={{ fontSize: 13, color: '#6b84a8', lineHeight: 1.7, marginBottom: 24 }}>
              <span style={{ color: '#eaf0ff', fontWeight: 600 }}>{deleteConfirm.company}</span>를<br />
              정말 삭제하시겠습니까?<br />
              <span style={{ color: '#dc3545', fontSize: 12 }}>관련된 모든 데이터가 함께 삭제되며 복구할 수 없습니다.</span>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setDeleteConfirm(null)}
                disabled={deleting}
                style={{ padding: '8px 18px', borderRadius: 8, border: '1px solid #1c2b44', background: 'none', color: '#6b84a8', fontSize: 13, cursor: 'pointer' }}
              >취소</button>
              <button
                onClick={confirmDelete}
                disabled={deleting}
                style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: '#dc3545', color: '#fff', fontSize: 13, fontWeight: 700, cursor: deleting ? 'not-allowed' : 'pointer', opacity: deleting ? 0.6 : 1 }}
              >{deleting ? '삭제 중...' : '삭제'}</button>
            </div>
          </div>
        </>
      )}

      {selected && (
        <>
          <div onClick={async () => { await panelRef.current?.flushSave(); setSelected(null) }} style={{ position: 'fixed', inset: 0, background: 'rgba(3,6,13,0.6)', zIndex: 100 }} />
          <CustomerDetailPanel
            ref={panelRef}
            customer={selected}
            profile={profile}
            consultants={consultants}
            onClose={() => setSelected(null)}
            onUpdate={handleUpdate}
          />
        </>
      )}
    </div>
  )
}
