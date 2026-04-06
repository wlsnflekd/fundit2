import { useState, useEffect } from 'react'
import { useT } from '../theme.jsx'
import {
  getPendingConsultants,
  approveProfile,
  rejectProfile,
  getWorkspaceMembers,
  resetUserPassword,
  getConsultantStats,
  deleteUser,
} from '../supabase.js'

const genTempPassword = () => `fundit${Math.floor(1000 + Math.random() * 9000)}`

function TempPasswordModal({ member, tempPassword, onClose }) {
  const C = useT()
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(tempPassword).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9100,
        background: 'rgba(0,0,0,0.65)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: C.s2, border: `1px solid ${C.line}`,
          borderRadius: 16, padding: '32px 28px',
          width: '100%', maxWidth: 380,
          boxShadow: '0 8px 40px rgba(0,0,0,0.5)',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{ fontSize: 28, marginBottom: 12 }}>🔑</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 6 }}>
            비밀번호 초기화 완료
          </div>
          <div style={{ fontSize: 13, color: C.sub }}>
            <strong style={{ color: C.text }}>{member.name}</strong>님의 임시 비밀번호입니다.
          </div>
        </div>

        <div style={{
          background: C.s3, border: `1px solid ${C.line}`,
          borderRadius: 10, padding: '14px 16px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 16,
        }}>
          <span style={{
            fontFamily: 'monospace', fontSize: 18, fontWeight: 700,
            color: C.gold, letterSpacing: '0.08em',
          }}>
            {tempPassword}
          </span>
          <button
            onClick={handleCopy}
            style={{
              padding: '4px 12px', borderRadius: 6,
              border: `1px solid ${C.line}`,
              background: copied ? C.green : 'transparent',
              color: copied ? '#fff' : C.sub,
              fontSize: 12, fontWeight: 600, cursor: 'pointer',
              transition: 'all 0.15s', flexShrink: 0,
            }}
          >
            {copied ? '복사됨' : '복사'}
          </button>
        </div>

        <div style={{
          fontSize: 12, color: C.sub, lineHeight: 1.6,
          background: '#f0b84010', border: `1px solid ${C.gold}33`,
          borderRadius: 8, padding: '10px 12px', marginBottom: 20,
        }}>
          이 비밀번호를 해당 멤버에게 직접 전달하세요. 첫 로그인 후 비밀번호 변경이 요구됩니다.
        </div>

        <button
          onClick={onClose}
          style={{
            width: '100%', padding: '10px', borderRadius: 8, border: 'none',
            background: 'linear-gradient(135deg, #f0b840, #d4952a)',
            color: '#03060d', fontSize: 13, fontWeight: 700, cursor: 'pointer',
          }}
        >
          확인
        </button>
      </div>
    </div>
  )
}

const ROLE_LABEL = { admin: '관리자', consultant: '컨설턴트' }
const ROLE_COLOR = { admin: '#c9aa5a', consultant: '#3498db' }

// created_at (ISO string) → 'YYYY-MM-DD'
const fmtDate = (iso) => {
  if (!iso) return '-'
  return iso.slice(0, 10)
}

export default function Team({ profile }) {
  const C = useT()

  // ── 초대 폼 상태 ──────────────────────────────────────────────────────────
  const [showInvite, setShowInvite] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('consultant')
  const [inviteMsg, setInviteMsg] = useState('')

  // ── 멤버 / pending 상태 ───────────────────────────────────────────────────
  const [members, setMembers] = useState([])
  const [pending, setPending] = useState([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState('')   // 토스트 메시지 텍스트
  const [pwResult, setPwResult] = useState(null) // { member, tempPassword }

  // 토스트 표시 헬퍼: 2.5초 후 자동 소멸
  const showToast = (msg) => {
    setToast(msg)
    setTimeout(() => setToast(''), 2500)
  }

  // 초기 데이터 로드 — effect 내부에 async 함수 정의해서 직접 호출
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      const [membersRes, pendingRes, statsRes] = await Promise.all([
        getWorkspaceMembers(),
        getPendingConsultants(),
        getConsultantStats(),
      ])
      if (cancelled) return
      if (!membersRes.error) {
        const rawMembers = membersRes.data ?? []
        // 담당자별 통계와 멤버 데이터를 UUID로 merge
        const statsMap = {}
        ;(statsRes.data ?? []).forEach(s => { statsMap[s.id] = s })
        const enriched = rawMembers.map(m => ({
          ...m,
          customers: statsMap[m.id]?.customers ?? 0,
          applications: statsMap[m.id]?.applications ?? 0,
          approvals: statsMap[m.id]?.approvals ?? 0,
        }))
        setMembers(enriched)
      }
      if (!pendingRes.error) setPending(pendingRes.data ?? [])
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [])

  // ── 승인 처리 ─────────────────────────────────────────────────────────────
  const handleApprove = async (person) => {
    const { data, error } = await approveProfile(person.id)
    if (error) { showToast('승인 처리 중 오류가 발생했습니다.'); return }
    // pending 목록에서 제거
    setPending(prev => prev.filter(p => p.id !== person.id))
    // 팀 멤버 목록에 즉시 추가 (신규 멤버는 담당 건이 없으므로 통계 0으로 초기화)
    const newMember = {
      id: data?.id ?? person.id,
      name: data?.name ?? person.name,
      email: person.email,
      role: person.role ?? 'consultant',
      status: 'active',
      created_at: person.created_at,
      customers: 0,
      applications: 0,
      approvals: 0,
    }
    setMembers(prev => [...prev, newMember])
    showToast(`${person.name}님이 팀에 합류했습니다.`)
  }

  // ── 거절 처리 ─────────────────────────────────────────────────────────────
  const handleReject = async (person) => {
    const { error } = await rejectProfile(person.id)
    if (error) { showToast('거절 처리 중 오류가 발생했습니다.'); return }
    setPending(prev => prev.filter(p => p.id !== person.id))
    showToast(`${person.name}님을 거절했습니다.`)
  }

  // ── 비밀번호 초기화 (관리자 → 컨설턴트) ──────────────────────────────────
  const handleResetPassword = async (member) => {
    const tempPassword = genTempPassword()
    const { error } = await resetUserPassword(member.id, tempPassword)
    if (error) {
      showToast('비밀번호 초기화 중 오류가 발생했습니다.')
      return
    }
    setPwResult({ member, tempPassword })
  }

  // ── 멤버 삭제 (admin → consultant만 가능) ────────────────────────────────
  const handleDeleteMember = async (member) => {
    if (!window.confirm(`${member.name}님을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.`)) return
    const { error } = await deleteUser(member.id)
    if (error) {
      showToast('멤버 삭제 중 오류가 발생했습니다.')
      return
    }
    setMembers(prev => prev.filter(m => m.id !== member.id))
    showToast(`${member.name}님이 삭제되었습니다.`)
  }

  // ── 초대 발송 (시뮬레이션) ────────────────────────────────────────────────
  const handleInvite = () => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!inviteEmail.trim()) { setInviteMsg('이메일을 입력해주세요.'); return }
    if (!emailRegex.test(inviteEmail)) { setInviteMsg('올바른 이메일 형식이 아닙니다.'); return }
    setInviteMsg(`${inviteEmail}로 초대 메일을 발송했습니다.`)
    setInviteEmail('')
    setTimeout(() => { setShowInvite(false); setInviteMsg('') }, 2000)
  }

  // ── 파생값 ────────────────────────────────────────────────────────────────
  const active = members.filter(m => m.status === 'active')
  const inactive = members.filter(m => m.status !== 'active')

  // ── 서브 컴포넌트: 팀 멤버 카드 ──────────────────────────────────────────
  const MemberCard = ({ m }) => (
    <div style={{
      background: C.s2, border: `1px solid ${C.line}`, borderRadius: 12, padding: 16,
      display: 'flex', gap: 16, alignItems: 'flex-start',
      opacity: m.status === 'active' ? 1 : 0.5,
    }}>
      <div style={{
        width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
        background: (ROLE_COLOR[m.role] ?? ROLE_COLOR.consultant) + '33',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontWeight: 700, fontSize: 16, color: ROLE_COLOR[m.role] ?? ROLE_COLOR.consultant,
      }}>
        {m.name?.[0] ?? '?'}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <span style={{ fontWeight: 700, color: C.text }}>{m.name}</span>
          <span style={{
            fontSize: 11, padding: '1px 8px', borderRadius: 999,
            background: (ROLE_COLOR[m.role] ?? ROLE_COLOR.consultant) + '33',
            color: ROLE_COLOR[m.role] ?? ROLE_COLOR.consultant, fontWeight: 700,
          }}>
            {ROLE_LABEL[m.role] ?? m.role}
          </span>
          {m.status !== 'active' && (
            <span style={{ fontSize: 11, padding: '1px 8px', borderRadius: 999, background: '#95a5a633', color: '#95a5a6', fontWeight: 700 }}>비활성</span>
          )}
        </div>
        <div style={{ fontSize: 12, color: C.sub, marginBottom: 8 }}>{m.email}</div>
        <div style={{ display: 'flex', gap: 16 }}>
          {[
            { label: '담당 고객사', value: m.customers ?? 0 },
            { label: '진행 신청건', value: m.applications ?? 0 },
            { label: '승인 완료', value: m.approvals ?? 0 },
          ].map(stat => (
            <div key={stat.label} style={{ textAlign: 'center' }}>
              <div style={{ fontWeight: 700, fontSize: 18, color: C.text }}>{stat.value}</div>
              <div style={{ fontSize: 11, color: C.sub }}>{stat.label}</div>
            </div>
          ))}
          <div style={{ marginLeft: 'auto', textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
            <div>
              <div style={{ fontSize: 11, color: C.sub }}>합류일</div>
              <div style={{ fontSize: 12, color: C.text }}>{m.joined ?? fmtDate(m.created_at)}</div>
            </div>
            {/* 관리자가 컨설턴트 비밀번호 초기화 */}
            {profile?.role === 'admin' && m.role === 'consultant' && (
              <button
                onClick={() => handleResetPassword(m)}
                style={{
                  padding: '3px 10px', borderRadius: 6,
                  border: `1px solid ${C.line}`,
                  background: 'transparent', color: C.sub,
                  fontSize: 11, fontWeight: 600, cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = '#f0b84015'
                  e.currentTarget.style.color = C.gold
                  e.currentTarget.style.borderColor = C.gold + '88'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = 'transparent'
                  e.currentTarget.style.color = C.sub
                  e.currentTarget.style.borderColor = C.line
                }}
              >
                비밀번호 초기화
              </button>
            )}
            {/* 관리자가 컨설턴트 삭제 — 본인 제외 */}
            {profile?.role === 'admin' && m.role === 'consultant' && m.id !== profile?.id && (
              <button
                onClick={() => handleDeleteMember(m)}
                style={{
                  padding: '4px 10px',
                  fontSize: 12,
                  background: 'transparent',
                  border: `1px solid ${C.error}`,
                  color: C.error,
                  borderRadius: 4,
                  cursor: 'pointer',
                }}
              >
                삭제
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )

  // ── 렌더 ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ position: 'relative' }}>

      {/* 비밀번호 초기화 결과 모달 */}
      {pwResult && (
        <TempPasswordModal
          member={pwResult.member}
          tempPassword={pwResult.tempPassword}
          onClose={() => setPwResult(null)}
        />
      )}

      {/* 토스트 메시지 */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 32, left: '50%', transform: 'translateX(-50%)',
          background: C.s2, border: `1px solid ${C.line}`, borderRadius: 10,
          padding: '10px 20px', fontSize: 13, color: C.text, fontWeight: 600,
          boxShadow: '0 4px 20px rgba(0,0,0,0.4)', zIndex: 9999,
        }}>
          {toast}
        </div>
      )}

      {/* 헤더 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ margin: 0, color: C.text }}>팀 관리</h3>
        <button
          onClick={() => setShowInvite(v => !v)}
          style={{ padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 600, background: C.gold, color: C.base, fontSize: 13 }}
        >
          + 멤버 초대
        </button>
      </div>

      {/* 초대 폼 */}
      {showInvite && (
        <div style={{
          background: C.s2, border: `1px solid ${C.line}`, borderRadius: 12,
          padding: '16px 20px', marginBottom: 16,
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 12 }}>멤버 초대</div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <input
              value={inviteEmail} onChange={e => setInviteEmail(e.target.value)}
              placeholder="이메일 주소 입력"
              style={{
                flex: 1, padding: '9px 12px', background: C.s3, border: `1px solid ${C.line}`,
                borderRadius: 8, color: C.text, fontSize: 13, outline: 'none',
              }}
            />
            <select value={inviteRole} onChange={e => setInviteRole(e.target.value)}
              style={{
                padding: '9px 12px', background: C.s3, border: `1px solid ${C.line}`,
                borderRadius: 8, color: C.text, fontSize: 13, outline: 'none', cursor: 'pointer',
              }}>
              <option value="consultant">컨설턴트</option>
              <option value="admin">관리자</option>
            </select>
          </div>
          {inviteMsg && (
            <div style={{
              fontSize: 12,
              color: inviteMsg.includes('완료') || inviteMsg.includes('발송') ? C.green : '#dc3545',
              marginBottom: 8,
            }}>
              {inviteMsg}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleInvite} style={{
              padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
              background: 'linear-gradient(135deg, #f0b840, #d4952a)', color: '#03060d', fontWeight: 700, fontSize: 13,
            }}>초대 발송</button>
            <button onClick={() => { setShowInvite(false); setInviteEmail(''); setInviteMsg('') }}
              style={{
                padding: '8px 16px', borderRadius: 8, border: `1px solid ${C.line}`,
                background: 'transparent', color: C.sub, fontSize: 13, cursor: 'pointer',
              }}>취소</button>
          </div>
        </div>
      )}

      {/* 승인 대기 섹션 — pending 1명 이상일 때만 표시 */}
      {pending.length > 0 && (
        <div style={{
          background: C.s2, border: `1px solid ${C.gold}44`, borderRadius: 12,
          padding: '16px 20px', marginBottom: 16,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>승인 대기 중</span>
            <span style={{
              fontSize: 11, fontWeight: 700, padding: '1px 8px', borderRadius: 999,
              background: C.gold + '33', color: C.gold,
            }}>
              {pending.length}명
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {pending.map(p => (
              <div key={p.id} style={{
                background: C.s3, borderRadius: 10, padding: '12px 16px',
                display: 'flex', alignItems: 'center', gap: 12,
              }}>
                {/* 이니셜 아바타 */}
                <div style={{
                  width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                  background: C.sub + '33',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 700, fontSize: 14, color: C.sub,
                }}>
                  {p.name?.[0] ?? '?'}
                </div>
                {/* 이름 + 이메일 */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, color: C.text, fontSize: 13 }}>{p.name}</div>
                  <div style={{ fontSize: 12, color: C.sub, marginTop: 1 }}>{p.email}</div>
                </div>
                {/* 신청일 */}
                <div style={{ fontSize: 12, color: C.sub, whiteSpace: 'nowrap' }}>
                  신청일: {fmtDate(p.created_at)}
                </div>
                {/* 액션 버튼 */}
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button
                    onClick={() => handleApprove(p)}
                    style={{
                      padding: '6px 14px', borderRadius: 7, border: 'none', cursor: 'pointer',
                      background: C.green, color: '#ffffff', fontSize: 12, fontWeight: 700,
                    }}
                  >
                    승인
                  </button>
                  <button
                    onClick={() => handleReject(p)}
                    style={{
                      padding: '6px 14px', borderRadius: 7, border: 'none', cursor: 'pointer',
                      background: '#dc3545', color: '#ffffff', fontSize: 12, fontWeight: 700,
                    }}
                  >
                    거절
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 통계 카드 */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        {[
          { label: '전체 멤버', value: members.length },
          { label: '활성', value: active.length, color: C.green },
          { label: '관리자', value: members.filter(m => m.role === 'admin').length, color: C.gold },
        ].map(s => (
          <div key={s.label} style={{
            background: C.s2, border: `1px solid ${C.line}`, borderRadius: 10,
            padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <span style={{ color: C.sub, fontSize: 12 }}>{s.label}</span>
            <span style={{ fontWeight: 700, color: s.color || C.text }}>{s.value}명</span>
          </div>
        ))}
      </div>

      {/* 멤버 목록 */}
      {loading ? (
        <div style={{ color: C.sub, fontSize: 13, padding: '24px 0', textAlign: 'center' }}>
          불러오는 중...
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
            {active.map(m => <MemberCard key={m.id} m={m} />)}
          </div>
          {inactive.length > 0 && (
            <>
              <div style={{ color: C.sub, fontSize: 12, fontWeight: 600, marginBottom: 8 }}>비활성 멤버</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {inactive.map(m => <MemberCard key={m.id} m={m} />)}
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
