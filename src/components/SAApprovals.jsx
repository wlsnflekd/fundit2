import { useState, useEffect, useCallback } from 'react'
import { useT } from '../theme.jsx'
import { getPendingProfiles, approveProfile, rejectProfile } from '../supabase.js'

function ApprovalTable({ items, onApprove, onReject }) {
  const C = useT()

  const th = {
    textAlign: 'left',
    padding: '8px 14px',
    color: C.sub,
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    borderBottom: `1px solid ${C.line}`,
    whiteSpace: 'nowrap',
  }
  const td = {
    padding: '11px 14px',
    color: C.text,
    fontSize: 13,
    borderBottom: `1px solid ${C.line}`,
  }

  if (items.length === 0) {
    return (
      <div style={{ padding: '32px', textAlign: 'center', color: C.sub, fontSize: 13 }}>
        대기 중인 요청이 없습니다.
      </div>
    )
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: C.s1 }}>
            <th style={th}>이름</th>
            <th style={th}>이메일</th>
            <th style={th}>워크스페이스</th>
            <th style={th}>신청일</th>
            <th style={{ ...th, textAlign: 'center' }}>처리</th>
          </tr>
        </thead>
        <tbody>
          {items.map((req) => (
            <tr
              key={req.id}
              onMouseEnter={e => e.currentTarget.style.background = C.s3}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              style={{ transition: 'background 0.1s' }}
            >
              <td style={td}>
                <span style={{ fontWeight: 600 }}>{req.name}</span>
              </td>
              <td style={{ ...td, color: C.sub }}>{req.email}</td>
              <td style={td}>{req.workspace?.name ?? '-'}</td>
              <td style={{ ...td, color: C.sub }}>
                {req.created_at ? new Date(req.created_at).toLocaleDateString('ko-KR') : '-'}
              </td>
              <td style={{ ...td, textAlign: 'center' }}>
                <div style={{ display: 'inline-flex', gap: 8 }}>
                  <button
                    onClick={() => onApprove(req)}
                    style={{
                      padding: '5px 14px',
                      borderRadius: 6,
                      border: 'none',
                      background: C.green,
                      color: '#fff',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                      transition: 'opacity 0.15s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.opacity = '0.8'}
                    onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                  >
                    승인
                  </button>
                  <button
                    onClick={() => onReject(req)}
                    style={{
                      padding: '5px 14px',
                      borderRadius: 6,
                      border: 'none',
                      background: C.error,
                      color: '#fff',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                      transition: 'opacity 0.15s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.opacity = '0.8'}
                    onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                  >
                    거절
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function SAApprovals() {
  const C = useT()

  const [adminRequests, setAdminRequests] = useState([])
  const [consultantRequests, setConsultantRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [toastMsg, setToastMsg] = useState(null)

  const showToast = (msg, isError = false) => {
    setToastMsg({ msg, isError })
    setTimeout(() => setToastMsg(null), 2500)
  }

  const loadPending = useCallback(async () => {
    setLoading(true)
    const { data, error } = await getPendingProfiles()
    if (error) {
      console.error('getPendingProfiles error:', error)
      showToast('목록을 불러오지 못했습니다.', true)
      setLoading(false)
      return
    }
    const rows = data ?? []
    // role='admin': 신규 워크스페이스 생성자 (슈퍼관리자 승인 필요)
    setAdminRequests(rows.filter(r => r.role === 'admin'))
    // role='consultant': 기존 워크스페이스 합류 요청
    setConsultantRequests(rows.filter(r => r.role === 'consultant'))
    setLoading(false)
  }, [])

  useEffect(() => {
    loadPending()
  }, [loadPending])

  const handleApprove = async (req) => {
    const { error } = await approveProfile(req.id)
    if (error) {
      console.error('approveProfile error:', error)
      showToast(`${req.name}님 승인 처리 중 오류가 발생했습니다.`, true)
      return
    }
    showToast(`${req.name}님을 승인했습니다.`)
    await loadPending()
  }

  const handleReject = async (req) => {
    const { error } = await rejectProfile(req.id)
    if (error) {
      console.error('rejectProfile error:', error)
      showToast(`${req.name}님 거절 처리 중 오류가 발생했습니다.`, true)
      return
    }
    showToast(`${req.name}님을 거절했습니다.`, true)
    await loadPending()
  }

  const totalPending = adminRequests.length + consultantRequests.length

  return (
    <div>
      {/* 토스트 알림 */}
      {toastMsg && (
        <div style={{
          position: 'fixed', top: 24, right: 24, zIndex: 9999,
          padding: '12px 20px', borderRadius: 10,
          background: toastMsg.isError ? C.error : C.green,
          color: '#fff', fontSize: 13, fontWeight: 600,
          boxShadow: '0 4px 20px rgba(0,0,0,0.35)',
        }}>
          {toastMsg.msg}
        </div>
      )}

      {/* 상단 요약 배지 */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          background: totalPending > 0 ? '#f0b84022' : C.s2,
          border: `1px solid ${totalPending > 0 ? C.gold : C.line}`,
          borderRadius: 10, padding: '12px 18px',
        }}>
          <span style={{ fontSize: 18, color: C.sub }}>...</span>
          <div>
            <div style={{ fontSize: 11, color: C.sub, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              대기 중
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, color: totalPending > 0 ? C.gold : C.text, fontFamily: 'Bebas Neue, sans-serif' }}>
              {loading ? '...' : `${totalPending}건`}
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: '40px', textAlign: 'center', color: C.sub, fontSize: 13 }}>
          불러오는 중...
        </div>
      ) : (
        <>
          {/* 관리자 승인 섹션 */}
          <div style={{
            background: C.s2, border: `1px solid ${C.line}`,
            borderRadius: 12, overflow: 'hidden', marginBottom: 20,
          }}>
            <div style={{
              padding: '16px 20px', borderBottom: `1px solid ${C.line}`,
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>
                  관리자 승인 요청
                </div>
                <div style={{ fontSize: 12, color: C.sub, marginTop: 2 }}>
                  신규 워크스페이스 생성 요청 — 슈퍼관리자 직접 승인 필요
                </div>
              </div>
              {adminRequests.length > 0 && (
                <span style={{
                  marginLeft: 'auto',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  minWidth: 22, height: 22, borderRadius: 11,
                  background: C.gold, color: '#03060d',
                  fontSize: 11, fontWeight: 700, padding: '0 6px',
                }}>
                  {adminRequests.length}
                </span>
              )}
            </div>
            <ApprovalTable
              items={adminRequests}
              onApprove={handleApprove}
              onReject={handleReject}
            />
          </div>

          {/* 컨설턴트 승인 섹션 */}
          <div style={{
            background: C.s2, border: `1px solid ${C.line}`,
            borderRadius: 12, overflow: 'hidden',
          }}>
            <div style={{
              padding: '16px 20px', borderBottom: `1px solid ${C.line}`,
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>
                  컨설턴트 승인 요청
                </div>
                <div style={{ fontSize: 12, color: C.sub, marginTop: 2 }}>
                  기존 워크스페이스 합류 요청 — 해당 워크스페이스 관리자 승인 필요
                </div>
              </div>
              {consultantRequests.length > 0 && (
                <span style={{
                  marginLeft: 'auto',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  minWidth: 22, height: 22, borderRadius: 11,
                  background: C.blue, color: '#fff',
                  fontSize: 11, fontWeight: 700, padding: '0 6px',
                }}>
                  {consultantRequests.length}
                </span>
              )}
            </div>
            <ApprovalTable
              items={consultantRequests}
              onApprove={handleApprove}
              onReject={handleReject}
            />
          </div>
        </>
      )}
    </div>
  )
}
