import { useState, useEffect, useCallback } from 'react'
import { useT } from '../theme.jsx'
import { getSAWorkspacesWithMembers, approveProfile, rejectProfile, deleteWorkspace, updateMemberRole, resetUserPassword, deleteUser } from '../supabase.js'

const SAMPLE_WORKSPACES = [
  {
    id: 'ws1',
    name: '(주)그린컨설팅',
    plan: 'pro',
    created_at: '2025-11-03',
    members: [
      { id: 'm1', name: '김대표', email: 'kim@green.co.kr', role: 'admin', approval_status: 'approved' },
      { id: 'm2', name: '이수진', email: 'lee@green.co.kr', role: 'consultant', approval_status: 'approved' },
      { id: 'm3', name: '박민준', email: 'park@green.co.kr', role: 'consultant', approval_status: 'pending' },
      { id: 'm4', name: '최지영', email: 'choi@green.co.kr', role: 'consultant', approval_status: 'approved' },
    ],
  },
  {
    id: 'ws2',
    name: '미래정책자금연구소',
    plan: 'free',
    created_at: '2026-01-15',
    members: [
      { id: 'm5', name: '이소장', email: 'lee@mirae.co.kr', role: 'admin', approval_status: 'pending' },
      { id: 'm6', name: '정민호', email: 'jung@mirae.co.kr', role: 'consultant', approval_status: 'pending' },
    ],
  },
  {
    id: 'ws3',
    name: '한국기업지원센터',
    plan: 'enterprise',
    created_at: '2025-08-22',
    members: [
      { id: 'm7', name: '박센터장', email: 'park@kbec.kr', role: 'admin', approval_status: 'approved' },
      { id: 'm8', name: '김진우', email: 'kimjw@kbec.kr', role: 'consultant', approval_status: 'approved' },
      { id: 'm9', name: '윤하나', email: 'yoon@kbec.kr', role: 'consultant', approval_status: 'approved' },
      { id: 'm10', name: '송태양', email: 'song@kbec.kr', role: 'consultant', approval_status: 'approved' },
      { id: 'm11', name: '한예슬', email: 'han@kbec.kr', role: 'consultant', approval_status: 'approved' },
      { id: 'm12', name: '조성민', email: 'cho@kbec.kr', role: 'consultant', approval_status: 'approved' },
      { id: 'm13', name: '오현주', email: 'oh@kbec.kr', role: 'consultant', approval_status: 'approved' },
    ],
  },
  {
    id: 'ws4',
    name: '정책자금파트너스',
    plan: 'pro',
    created_at: '2026-02-01',
    members: [
      { id: 'm14', name: '최파트너', email: 'choi@partners.co.kr', role: 'admin', approval_status: 'approved' },
      { id: 'm15', name: '류정현', email: 'ryu@partners.co.kr', role: 'consultant', approval_status: 'approved' },
      { id: 'm16', name: '강민서', email: 'kang@partners.co.kr', role: 'consultant', approval_status: 'pending' },
    ],
  },
  {
    id: 'ws5',
    name: '스마트펀딩컨설팅',
    plan: 'free',
    created_at: '2026-03-18',
    members: [
      { id: 'm17', name: '정대표', email: 'jung@smart.co.kr', role: 'admin', approval_status: 'approved' },
    ],
  },
  {
    id: 'ws6',
    name: '(미완성) 관리자없는워크스페이스',
    plan: 'free',
    created_at: '2026-04-01',
    members: [
      { id: 'm18', name: '홍길동', email: 'hong@test.co.kr', role: 'consultant', approval_status: 'pending' },
    ],
  },
]

const PLAN_LABEL = {
  free: { label: 'Free', color: '#6b84a8' },
  pro: { label: 'Pro', color: '#1d6fe8' },
  enterprise: { label: 'Enterprise', color: '#f0b840' },
}

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

        {/* 임시 비밀번호 표시 */}
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
            width: '100%', padding: '10px', borderRadius: 8,
            border: 'none',
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

function hasPending(ws) {
  return (ws.members ?? []).some(m => m.approval_status === 'pending')
}

function pendingCount(ws) {
  return (ws.members ?? []).filter(m => m.approval_status === 'pending').length
}

function MemberRow({ member, onApprove, onReject, onRoleChange, onResetPassword, onDeleteMember, currentUserId, isLast }) {
  const C = useT()
  const isAdmin = member.role === 'admin'
  const isPending = member.approval_status === 'pending'
  const isApproved = member.approval_status === 'approved'

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '9px 20px',
      paddingLeft: isAdmin ? 20 : 44,
      borderBottom: isLast ? 'none' : `1px solid ${C.line}`,
      background: isPending ? `${C.gold}08` : 'transparent',
      transition: 'background 0.1s',
    }}>
      {/* tree line prefix for consultants */}
      {!isAdmin && (
        <span style={{ color: C.line, fontSize: 13, marginLeft: -16, marginRight: 4, userSelect: 'none' }}>└</span>
      )}

      {/* role icon */}
      <span style={{ fontSize: 14, flexShrink: 0 }}>
        {isAdmin ? '👑' : ''}
      </span>

      {/* avatar */}
      <div style={{
        width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
        background: isAdmin ? '#f0b84022' : C.s3,
        border: `1px solid ${isAdmin ? '#f0b84055' : C.line}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 11, fontWeight: 700,
        color: isAdmin ? C.gold : C.sub,
      }}>
        {member.name?.[0] ?? '?'}
      </div>

      {/* name + email */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: 13, fontWeight: isAdmin ? 600 : 400, color: C.text }}>
          {member.name}
        </span>
        <span style={{ fontSize: 11, color: C.sub, marginLeft: 8 }}>{member.email}</span>
      </div>

      {/* role badge */}
      <span style={{
        fontSize: 11, fontWeight: 600,
        padding: '2px 8px', borderRadius: 20,
        background: isAdmin ? '#f0b84018' : C.s3,
        color: isAdmin ? C.gold : C.sub,
        border: `1px solid ${isAdmin ? '#f0b84044' : C.line}`,
        flexShrink: 0,
      }}>
        {isAdmin ? '관리자' : '컨설턴트'}
      </span>

      {/* approved 멤버 전용 액션 버튼 */}
      {isApproved && (
        <>
          {/* 역할 변경 */}
          <button
            onClick={() => onRoleChange(member, isAdmin ? 'consultant' : 'admin')}
            title={isAdmin ? '컨설턴트로 변경' : '관리자로 변경'}
            style={{
              padding: '3px 10px', borderRadius: 6,
              border: `1px solid ${C.line}`,
              background: 'transparent', color: C.sub,
              fontSize: 11, fontWeight: 600, cursor: 'pointer',
              flexShrink: 0, transition: 'all 0.15s', whiteSpace: 'nowrap',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = C.s3
              e.currentTarget.style.color = C.text
              e.currentTarget.style.borderColor = C.text
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'transparent'
              e.currentTarget.style.color = C.sub
              e.currentTarget.style.borderColor = C.line
            }}
          >
            {isAdmin ? '→ 컨설턴트' : '→ 관리자'}
          </button>

          {/* 비밀번호 초기화 */}
          <button
            onClick={() => onResetPassword(member)}
            title="임시 비밀번호로 초기화"
            style={{
              padding: '3px 10px', borderRadius: 6,
              border: `1px solid ${C.line}`,
              background: 'transparent', color: C.sub,
              fontSize: 11, fontWeight: 600, cursor: 'pointer',
              flexShrink: 0, transition: 'all 0.15s', whiteSpace: 'nowrap',
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

          {/* 멤버 삭제 — 본인 제외 */}
          {member.id !== currentUserId && (
            <button
              onClick={() => onDeleteMember(member)}
              title="멤버 삭제"
              style={{
                padding: '4px 10px',
                fontSize: 12,
                background: 'transparent',
                border: `1px solid ${C.error}`,
                color: C.error,
                borderRadius: 4,
                cursor: 'pointer',
                flexShrink: 0,
              }}
            >
              삭제
            </button>
          )}
        </>
      )}

      {/* status or action */}
      {isPending ? (
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          <button
            onClick={() => onApprove(member)}
            style={{
              padding: '4px 12px', borderRadius: 6, border: 'none',
              background: C.green, color: '#fff',
              fontSize: 12, fontWeight: 600, cursor: 'pointer',
              transition: 'opacity 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.opacity = '0.8'}
            onMouseLeave={e => e.currentTarget.style.opacity = '1'}
          >
            승인
          </button>
          <button
            onClick={() => onReject(member)}
            style={{
              padding: '4px 12px', borderRadius: 6, border: 'none',
              background: C.error, color: '#fff',
              fontSize: 12, fontWeight: 600, cursor: 'pointer',
              transition: 'opacity 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.opacity = '0.8'}
            onMouseLeave={e => e.currentTarget.style.opacity = '1'}
          >
            거절
          </button>
        </div>
      ) : (
        <span style={{
          fontSize: 11, fontWeight: 600,
          padding: '2px 8px', borderRadius: 20, flexShrink: 0,
          background: isApproved ? '#0ea57118' : '#dc354518',
          color: isApproved ? C.green : C.error,
          border: `1px solid ${isApproved ? '#0ea57144' : '#dc354544'}`,
        }}>
          {isApproved ? '승인됨' : '거절됨'}
        </span>
      )}
    </div>
  )
}

function DeleteConfirmModal({ ws, onConfirm, onCancel }) {
  const C = useT()
  const memberCount = ws.members?.length ?? 0

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9000,
      background: 'rgba(0,0,0,0.65)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}
      onClick={onCancel}
    >
      <div
        style={{
          background: C.s2,
          border: `1px solid ${C.error}88`,
          borderRadius: 16,
          padding: '32px 28px',
          width: '100%', maxWidth: 400,
          boxShadow: '0 8px 40px rgba(0,0,0,0.5)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* 아이콘 */}
        <div style={{
          width: 48, height: 48, borderRadius: '50%',
          background: '#dc354520',
          border: `2px solid ${C.error}55`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 22, margin: '0 auto 20px',
        }}>
          ⚠
        </div>

        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 8 }}>
            워크스페이스를 삭제하시겠습니까?
          </div>
          <div style={{
            fontSize: 14, fontWeight: 600,
            color: C.error, marginBottom: 12,
          }}>
            {ws.name}
          </div>
          <div style={{ fontSize: 13, color: C.sub, lineHeight: 1.7 }}>
            멤버 <strong style={{ color: C.text }}>{memberCount}명</strong>과 관련된
            모든 고객사, 신청건, 프로필 데이터가
            <br />
            <strong style={{ color: C.error }}>영구 삭제</strong>됩니다. 이 작업은 되돌릴 수 없습니다.
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={onCancel}
            style={{
              flex: 1, padding: '10px', borderRadius: 8,
              border: `1px solid ${C.line}`,
              background: 'transparent', color: C.text,
              fontSize: 13, fontWeight: 600, cursor: 'pointer',
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.background = C.s3}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            취소
          </button>
          <button
            onClick={onConfirm}
            style={{
              flex: 1, padding: '10px', borderRadius: 8,
              border: 'none',
              background: C.error, color: '#fff',
              fontSize: 13, fontWeight: 600, cursor: 'pointer',
              transition: 'opacity 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
            onMouseLeave={e => e.currentTarget.style.opacity = '1'}
          >
            삭제
          </button>
        </div>
      </div>
    </div>
  )
}

function WorkspaceRow({ ws, onApprove, onReject, onRoleChange, onResetPassword, onDelete, onDeleteMember, currentUserId }) {
  const C = useT()
  const [open, setOpen] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const pending = pendingCount(ws)
  const plan = PLAN_LABEL[ws.plan] ?? { label: ws.plan, color: C.sub }

  // admin first, then consultants
  const members = [...(ws.members ?? [])].sort((a, b) => {
    if (a.role === 'admin' && b.role !== 'admin') return -1
    if (b.role === 'admin' && a.role !== 'admin') return 1
    return 0
  })

  const hasPendingMembers = pending > 0

  return (
    <>
      {showDeleteModal && (
        <DeleteConfirmModal
          ws={ws}
          onConfirm={() => { setShowDeleteModal(false); onDelete(ws) }}
          onCancel={() => setShowDeleteModal(false)}
        />
      )}

      <div style={{
        border: `1px solid ${hasPendingMembers ? C.gold + '88' : C.line}`,
        borderRadius: 12,
        overflow: 'hidden',
        background: C.s2,
        boxShadow: hasPendingMembers ? `0 0 0 1px ${C.gold}22` : 'none',
      }}>
        {/* accordion header */}
        <div
          onClick={() => setOpen(o => !o)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '14px 20px',
            cursor: 'pointer',
            background: open ? C.s3 : 'transparent',
            transition: 'background 0.15s',
            userSelect: 'none',
          }}
          onMouseEnter={e => { if (!open) e.currentTarget.style.background = C.s3 }}
          onMouseLeave={e => { if (!open) e.currentTarget.style.background = 'transparent' }}
        >
          {/* chevron */}
          <span style={{
            fontSize: 10,
            color: C.sub,
            transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s',
            flexShrink: 0,
          }}>▶</span>

          {/* workspace name */}
          <span style={{ fontSize: 14, fontWeight: 600, color: C.text, flex: 1 }}>
            {ws.name}
          </span>

          {/* pending badge */}
          {pending > 0 && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '3px 10px', borderRadius: 20,
              background: '#f0b84022',
              border: `1px solid ${C.gold}66`,
              fontSize: 11, fontWeight: 700, color: C.gold,
            }}>
              대기 {pending}
            </span>
          )}

          {/* plan badge */}
          <span style={{
            padding: '2px 8px', borderRadius: 20,
            background: `${plan.color}22`,
            border: `1px solid ${plan.color}55`,
            fontSize: 11, fontWeight: 700,
            color: plan.color,
          }}>
            {plan.label}
          </span>

          {/* member count */}
          <span style={{
            fontSize: 12, color: C.sub,
            display: 'flex', alignItems: 'center', gap: 4,
          }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 22, height: 22, borderRadius: '50%',
              background: C.s3, fontSize: 11, fontWeight: 600, color: C.sub,
            }}>
              {ws.members?.length ?? 0}
            </span>
            명
          </span>

          {/* created date */}
          <span style={{ fontSize: 11, color: C.sub, flexShrink: 0 }}>
            {ws.created_at?.slice(0, 10)}
          </span>

          {/* delete button */}
          <button
            onClick={e => { e.stopPropagation(); setShowDeleteModal(true) }}
            style={{
              padding: '4px 12px', borderRadius: 6,
              border: `1px solid ${C.error}55`,
              background: '#dc354512', color: C.error,
              fontSize: 12, fontWeight: 600, cursor: 'pointer',
              flexShrink: 0,
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = '#dc354528' }}
            onMouseLeave={e => { e.currentTarget.style.background = '#dc354512' }}
          >
            삭제
          </button>
        </div>

        {/* accordion body */}
        {open && (
          <div style={{ borderTop: `1px solid ${C.line}` }}>
            {members.length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', color: C.sub, fontSize: 13 }}>
                멤버가 없습니다.
              </div>
            ) : (
              members.map((member, i) => (
                <MemberRow
                  key={member.id}
                  member={member}
                  onApprove={onApprove}
                  onReject={onReject}
                  onRoleChange={onRoleChange}
                  onResetPassword={onResetPassword}
                  onDeleteMember={onDeleteMember}
                  currentUserId={currentUserId}
                  isLast={i === members.length - 1}
                />
              ))
            )}
          </div>
        )}
      </div>
    </>
  )
}

export default function SAWorkspaces({ profile }) {
  const C = useT()
  const [workspaces, setWorkspaces] = useState(SAMPLE_WORKSPACES)
  const [loading, setLoading] = useState(false)
  const [toastMsg, setToastMsg] = useState(null)
  const [pwResult, setPwResult] = useState(null) // { member, tempPassword }
  const currentUserId = profile?.id ?? null

  const showToast = (msg, isError = false) => {
    setToastMsg({ msg, isError })
    setTimeout(() => setToastMsg(null), 2500)
  }

  const loadData = useCallback(async () => {
    setLoading(true)
    const { data, error } = await getSAWorkspacesWithMembers()
    if (!error && data?.length > 0) {
      setWorkspaces(data)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleApprove = async (member) => {
    const { error } = await approveProfile(member.id)
    if (error) {
      showToast(`${member.name}님 승인 처리 중 오류가 발생했습니다.`, true)
      return
    }
    showToast(`${member.name}님을 승인했습니다.`)
    setWorkspaces(prev => prev.map(ws => ({
      ...ws,
      members: (ws.members ?? []).map(m =>
        m.id === member.id ? { ...m, approval_status: 'approved' } : m
      ),
    })))
  }

  const handleReject = async (member) => {
    const { error } = await rejectProfile(member.id)
    if (error) {
      showToast(`${member.name}님 거절 처리 중 오류가 발생했습니다.`, true)
      return
    }
    showToast(`${member.name}님을 거절했습니다.`, true)
    setWorkspaces(prev => prev.map(ws => ({
      ...ws,
      members: (ws.members ?? []).map(m =>
        m.id === member.id ? { ...m, approval_status: 'rejected' } : m
      ),
    })))
  }

  const handleResetPassword = async (member) => {
    const tempPassword = genTempPassword()
    const { error } = await resetUserPassword(member.id, tempPassword)
    if (error) {
      showToast(`${member.name}님 비밀번호 초기화 중 오류가 발생했습니다.`, true)
      return
    }
    setPwResult({ member, tempPassword })
  }

  const handleRoleChange = async (member, newRole) => {
    // 마지막 관리자를 컨설턴트로 변경하려는 경우 차단
    if (newRole === 'consultant') {
      const ws = workspaces.find(w => (w.members ?? []).some(m => m.id === member.id))
      const adminCount = (ws?.members ?? []).filter(m => m.role === 'admin').length
      if (adminCount <= 1) {
        showToast('워크스페이스에 관리자가 최소 1명은 있어야 합니다.', true)
        return
      }
    }

    const { error } = await updateMemberRole(member.id, newRole)
    if (error) {
      showToast(`${member.name}님 역할 변경 중 오류가 발생했습니다.`, true)
      return
    }
    const roleLabel = newRole === 'admin' ? '관리자' : '컨설턴트'
    showToast(`${member.name}님을 ${roleLabel}로 변경했습니다.`)
    setWorkspaces(prev => prev.map(ws => ({
      ...ws,
      members: (ws.members ?? []).map(m =>
        m.id === member.id ? { ...m, role: newRole } : m
      ),
    })))
  }

  const handleDelete = async (ws) => {
    const { error } = await deleteWorkspace(ws.id)
    if (error) {
      showToast(`${ws.name} 삭제 중 오류가 발생했습니다.`, true)
      return
    }
    showToast(`${ws.name}이(가) 삭제되었습니다.`, true)
    setWorkspaces(prev => prev.filter(w => w.id !== ws.id))
  }

  const handleDeleteMember = async (member) => {
    if (!window.confirm(`${member.name}님을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.`)) return
    const { error } = await deleteUser(member.id)
    if (error) {
      showToast(`${member.name}님 삭제 중 오류가 발생했습니다.`, true)
      return
    }
    showToast(`${member.name}님이 삭제되었습니다.`, true)
    setWorkspaces(prev => prev.map(ws => ({
      ...ws,
      members: (ws.members ?? []).filter(m => m.id !== member.id),
    })))
  }

  // admin이 있는 워크스페이스만 표시
  const withAdmin = workspaces.filter(ws =>
    (ws.members ?? []).some(m => m.role === 'admin')
  )

  // 승인 대기 중인 워크스페이스를 상단에 표시
  const sorted = [...withAdmin].sort((a, b) => {
    const pa = hasPending(a) ? 1 : 0
    const pb = hasPending(b) ? 1 : 0
    return pb - pa
  })

  const totalPending = withAdmin.reduce((acc, ws) => acc + pendingCount(ws), 0)

  return (
    <div>
      {/* 비밀번호 초기화 결과 모달 */}
      {pwResult && (
        <TempPasswordModal
          member={pwResult.member}
          tempPassword={pwResult.tempPassword}
          onClose={() => setPwResult(null)}
        />
      )}

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

      {/* 상단 요약 카드 */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        {[
          { label: '전체 워크스페이스', value: withAdmin.length },
          { label: '승인 대기', value: totalPending, accent: totalPending > 0 },
          { label: 'Pro 플랜', value: withAdmin.filter(w => w.plan === 'pro').length },
          { label: 'Enterprise', value: withAdmin.filter(w => w.plan === 'enterprise').length },
          { label: '전체 멤버', value: withAdmin.reduce((acc, w) => acc + (w.members?.length ?? 0), 0) },
        ].map(({ label, value, accent }) => (
          <div key={label} style={{
            flex: '1 1 140px',
            background: accent ? '#f0b84010' : C.s2,
            border: `1px solid ${accent ? C.gold + '66' : C.line}`,
            borderRadius: 12,
            padding: '16px 20px',
          }}>
            <div style={{
              fontSize: 11, color: accent ? C.gold : C.sub,
              fontWeight: 600, letterSpacing: '0.06em',
              textTransform: 'uppercase', marginBottom: 6,
            }}>
              {label}
            </div>
            <div style={{
              fontSize: 26, fontWeight: 700,
              color: accent ? C.gold : C.text,
              fontFamily: 'Bebas Neue, sans-serif', letterSpacing: '0.04em',
            }}>
              {loading ? '...' : value}
            </div>
          </div>
        ))}
      </div>

      {/* 섹션 레이블 */}
      <div style={{
        fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
        textTransform: 'uppercase', color: C.sub, marginBottom: 12,
      }}>
        워크스페이스 목록
        {totalPending > 0 && (
          <span style={{
            marginLeft: 8, padding: '2px 8px', borderRadius: 20,
            background: '#f0b84022', color: C.gold,
            border: `1px solid ${C.gold}44`, fontSize: 11,
          }}>
            승인 대기 {totalPending}건
          </span>
        )}
      </div>

      {/* 아코디언 목록 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {sorted.map(ws => (
          <WorkspaceRow
            key={ws.id}
            ws={ws}
            onApprove={handleApprove}
            onReject={handleReject}
            onRoleChange={handleRoleChange}
            onResetPassword={handleResetPassword}
            onDelete={handleDelete}
            onDeleteMember={handleDeleteMember}
            currentUserId={currentUserId}
          />
        ))}
      </div>
    </div>
  )
}
