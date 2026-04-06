import { useState, useEffect } from 'react'
import { useT } from '../theme.jsx'
import { getStatsData, getConsultantStats } from '../supabase.js'

const STATUS_COLOR = {
  '신청예정': '#3498db',
  '서류준비': '#f39c12',
  '검토중': '#f39c12',
  '보완요청': '#e67e22',
  '승인완료': '#27ae60',
  '반려': '#e74c3c',
}

export default function Stats() {
  const C = useT()
  const [stats, setStats] = useState(null)
  const [consultantStats, setConsultantStats] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = async () => {
    setLoading(true)
    setError('')
    const [statsRes, consultantRes] = await Promise.all([
      getStatsData(),
      getConsultantStats(),
    ])
    if (statsRes.error) {
      console.error(statsRes.error)
      setError('통계를 불러오지 못했습니다. 다시 시도해주세요.')
    } else {
      setStats(statsRes.data)
    }
    if (!consultantRes.error) {
      setConsultantStats(consultantRes.data ?? [])
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  if (loading) {
    return <div style={{ padding: 32, textAlign: 'center', color: C.sub }}>불러오는 중...</div>
  }

  if (error || !stats) {
    return (
      <div style={{ padding: 32, textAlign: 'center' }}>
        <div style={{ color: '#dc3545', marginBottom: 12 }}>{error || '데이터를 불러오지 못했습니다.'}</div>
        <button onClick={load} style={{ padding: '8px 16px', borderRadius: 8, border: `1px solid ${C.line}`, background: C.s3, color: C.text, cursor: 'pointer', fontSize: 13 }}>다시 시도</button>
      </div>
    )
  }

  const { totalCustomers, totalApps, approvedCount, approvalRate, totalAmount, monthlyData, statusCounts } = stats

  const maxApps = Math.max(...monthlyData.map(d => d.applied), 1)

  const statusEntries = Object.entries(statusCounts)
  const totalStatusCount = statusEntries.reduce((s, [, c]) => s + c, 0)

  const section = { background: C.s2, border: `1px solid ${C.line}`, borderRadius: 14, padding: 16, marginBottom: 16 }
  const sectionTitle = { fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 14 }

  return (
    <div>
      <h3 style={{ marginBottom: 16, color: C.text }}>전체 통계</h3>

      {/* KPI 카드 */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        {[
          { label: '총 신청건', value: totalApps + '건', color: C.text },
          { label: '승인 완료', value: approvedCount + '건', color: C.green },
          { label: '승인율', value: approvalRate + '%', color: C.gold },
          { label: '총 지원금액', value: totalAmount >= 1 ? `${totalAmount.toFixed(1)}억` : `${(totalAmount * 10000).toLocaleString()}만`, color: C.blue },
          { label: '관리 고객사', value: totalCustomers + '개사', color: C.text },
        ].map(k => (
          <div key={k.label} style={{ background: C.s2, border: `1px solid ${C.line}`, borderRadius: 12, padding: '12px 20px', minWidth: 120, flex: 1 }}>
            <div style={{ fontSize: 12, color: C.sub, marginBottom: 4 }}>{k.label}</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: k.color }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* 월별 신청 현황 */}
      <div style={section}>
        <div style={sectionTitle}>월별 신청 및 승인 현황 (최근 6개월)</div>
        {totalApps === 0 ? (
          <div style={{ textAlign: 'center', color: C.sub, fontSize: 13, padding: '24px 0' }}>
            아직 신청 데이터가 없습니다.
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', height: 120 }}>
              {monthlyData.map(d => (
                <div key={d.month} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <div style={{ width: '100%', display: 'flex', gap: 3, alignItems: 'flex-end', height: 90 }}>
                    <div style={{ flex: 1, background: C.blue + '99', borderRadius: '3px 3px 0 0', height: `${(d.applied / maxApps) * 80}px`, minHeight: d.applied > 0 ? 4 : 0 }} title={`신청 ${d.applied}건`} />
                    <div style={{ flex: 1, background: C.green, borderRadius: '3px 3px 0 0', height: `${(d.approved / maxApps) * 80}px`, minHeight: d.approved > 0 ? 4 : 0 }} title={`승인 ${d.approved}건`} />
                  </div>
                  <div style={{ fontSize: 11, color: C.sub }}>{d.month}</div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: C.sub }}>
                <div style={{ width: 10, height: 10, background: C.blue + '99', borderRadius: 2 }} /> 신청
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: C.sub }}>
                <div style={{ width: 10, height: 10, background: C.green, borderRadius: 2 }} /> 승인
              </div>
            </div>
          </>
        )}
      </div>

      <div style={{ display: 'flex', gap: 16 }}>
        {/* 담당자별 성과 */}
        <div style={{ ...section, flex: 1, marginBottom: 0 }}>
          <div style={sectionTitle}>담당자별 성과</div>
          {consultantStats.length === 0 ? (
            <div style={{ textAlign: 'center', color: C.sub, fontSize: 13, padding: '16px 0' }}>담당자 데이터가 없습니다.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['담당자', '고객사', '신청건', '승인', '지원금액'].map(h => (
                    <th key={h} style={{ textAlign: h === '담당자' ? 'left' : 'right', padding: '4px 8px', fontSize: 11, color: C.sub, borderBottom: `1px solid ${C.line}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {consultantStats.map((c, i) => (
                  <tr key={c.id}>
                    <td style={{ padding: '8px', fontSize: 13, fontWeight: 600, color: C.text, borderBottom: i < consultantStats.length - 1 ? `1px solid ${C.line}` : 'none' }}>{c.name}</td>
                    <td style={{ padding: '8px', fontSize: 13, color: C.text, textAlign: 'right', borderBottom: i < consultantStats.length - 1 ? `1px solid ${C.line}` : 'none' }}>{c.customers}</td>
                    <td style={{ padding: '8px', fontSize: 13, color: C.text, textAlign: 'right', borderBottom: i < consultantStats.length - 1 ? `1px solid ${C.line}` : 'none' }}>{c.applications}</td>
                    <td style={{ padding: '8px', fontSize: 13, fontWeight: 700, color: C.green, textAlign: 'right', borderBottom: i < consultantStats.length - 1 ? `1px solid ${C.line}` : 'none' }}>{c.approvals}</td>
                    <td style={{ padding: '8px', fontSize: 13, color: C.gold, textAlign: 'right', borderBottom: i < consultantStats.length - 1 ? `1px solid ${C.line}` : 'none' }}>
                      {c.amount >= 1 ? `${c.amount.toFixed(1)}억` : `${(c.amount * 10000).toFixed(0)}만`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* 신청건 상태 분포 */}
        <div style={{ ...section, width: 200, marginBottom: 0, flexShrink: 0 }}>
          <div style={sectionTitle}>신청건 상태</div>
          {statusEntries.length === 0 ? (
            <div style={{ textAlign: 'center', color: C.sub, fontSize: 13, padding: '16px 0' }}>데이터 없음</div>
          ) : (
            statusEntries.map(([status, count]) => {
              const pct = totalStatusCount ? Math.round((count / totalStatusCount) * 100) : 0
              const color = STATUS_COLOR[status] ?? C.sub
              return (
                <div key={status} style={{ marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                    <span style={{ fontSize: 12, color: C.sub }}>{status}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color }}>{count}건</span>
                  </div>
                  <div style={{ height: 6, borderRadius: 3, background: C.s3, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 3 }} />
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
