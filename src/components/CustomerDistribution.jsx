import { useState, useEffect } from 'react'
import { useT } from '../theme.jsx'
import { StatusBadge } from './Common.jsx'
import { supabase, getCustomers, createAssignmentNotification } from '../supabase.js'

export default function CustomerDistribution({ profile }) {
  const C = useT()
  const [customers, setCustomers] = useState([])
  const [consultants, setConsultants] = useState([])
  const [loading, setLoading] = useState(true)
  // rowStatus: { customerId: 'saving' | 'saved' | 'error' }
  const [rowStatus, setRowStatus] = useState({})

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const [custRes, membersRes] = await Promise.all([
          getCustomers(),
          supabase.from('profiles').select('id, name').eq('approval_status', 'approved'),
        ])
        if (custRes.error) console.error('getCustomers error:', custRes.error)
        if (membersRes.error) console.error('profiles error:', membersRes.error)
        setCustomers(custRes.data ?? [])
        setConsultants(membersRes.data ?? [])
      } catch (err) {
        console.error('CustomerDistribution loadData exception:', err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const handleAssignChange = async (customerId, newConsultantId, companyName) => {
    setRowStatus(prev => ({ ...prev, [customerId]: 'saving' }))

    const { error } = await supabase
      .from('customers')
      .update({ consultant: newConsultantId || null })
      .eq('id', customerId)

    if (error) {
      console.error('배분 저장 오류:', error)
      setRowStatus(prev => ({ ...prev, [customerId]: 'error' }))
      setTimeout(() => setRowStatus(prev => { const n = { ...prev }; delete n[customerId]; return n }), 3000)
      return
    }

    // 로컬 상태 즉시 갱신
    setCustomers(prev => prev.map(c =>
      c.id === customerId ? { ...c, consultant: newConsultantId || null } : c
    ))
    setRowStatus(prev => ({ ...prev, [customerId]: 'saved' }))
    setTimeout(() => setRowStatus(prev => { const n = { ...prev }; delete n[customerId]; return n }), 2000)

    // 알림 전송 (담당자 지정 시, admin/superadmin만)
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
  }

  const consultantNameMap = {}
  consultants.forEach(m => { consultantNameMap[m.id] = m.name })

  const unassignedCount = customers.filter(c => !c.consultant).length

  const th = {
    textAlign: 'left', padding: '8px 12px',
    color: C.sub, fontSize: 12, fontWeight: 600,
    borderBottom: `1px solid ${C.line}`,
  }
  const td = {
    padding: '10px 12px', color: C.text,
    fontSize: 13, borderBottom: `1px solid ${C.line}`,
  }

  if (loading) {
    return <div style={{ padding: 32, textAlign: 'center', color: C.sub }}>불러오는 중...</div>
  }

  return (
    <div>
      {/* 헤더 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 12 }}>
        <h3 style={{ margin: 0, color: C.text }}>고객사 배분</h3>
        {unassignedCount > 0 && (
          <span style={{ fontSize: 12, color: C.gold, fontWeight: 600 }}>미배분 {unassignedCount}건</span>
        )}
        <span style={{ fontSize: 12, color: C.sub, marginLeft: 'auto' }}>담당자 드롭다운 변경 시 즉시 저장됩니다.</span>
      </div>

      <div style={{ background: C.s2, border: `1px solid ${C.line}`, borderRadius: 14, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={th}>회사명</th>
              <th style={th}>업종</th>
              <th style={th}>담당자</th>
              <th style={th}>상태</th>
            </tr>
          </thead>
          <tbody>
            {customers.map(c => {
              const currentName = consultantNameMap[c.consultant] || '미배분'
              const status = rowStatus[c.id]
              return (
                <tr key={c.id} style={{
                  background: status === 'saved' ? C.green + '15'
                    : status === 'error' ? C.error + '15'
                    : '',
                  transition: 'background 0.3s',
                }}>
                  <td style={td}>{c.company}</td>
                  <td style={td}>{c.industry || '-'}</td>
                  <td style={td}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <select
                        value={c.consultant ?? ''}
                        disabled={status === 'saving'}
                        onChange={e => handleAssignChange(c.id, e.target.value, c.company)}
                        style={{
                          padding: '5px 8px', borderRadius: 6, outline: 'none',
                          background: C.s3, border: `1px solid ${C.line}`,
                          color: C.text, fontSize: 12, cursor: status === 'saving' ? 'not-allowed' : 'pointer',
                          opacity: status === 'saving' ? 0.6 : 1,
                        }}
                      >
                        <option value="">미배분</option>
                        {consultants.map(m => (
                          <option key={m.id} value={m.id}>{m.name}</option>
                        ))}
                      </select>
                      {status === 'saving' && <span style={{ fontSize: 11, color: C.gold }}>저장 중...</span>}
                      {status === 'saved' && <span style={{ fontSize: 11, color: C.green }}>저장됨</span>}
                      {status === 'error' && <span style={{ fontSize: 11, color: C.error }}>오류</span>}
                    </div>
                  </td>
                  <td style={td}>{c.status ? <StatusBadge status={c.status} /> : '-'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {customers.length === 0 && (
          <div style={{ padding: 32, textAlign: 'center', color: C.sub }}>등록된 고객사가 없습니다.</div>
        )}
      </div>
    </div>
  )
}
