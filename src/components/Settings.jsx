import { useState } from 'react'
import { useT, useTheme } from '../theme.jsx'
import { supabase } from '../supabase.js'

// 공통 토글 스위치
function Toggle({ value, onChange }) {
  const C = useT()
  return (
    <div
      onClick={() => onChange(!value)}
      style={{
        width: 48, height: 26, borderRadius: 13,
        background: value ? C.gold : C.s3,
        border: `1px solid ${C.line}`, cursor: 'pointer',
        position: 'relative', transition: 'background 0.2s', flexShrink: 0,
      }}
    >
      <div style={{
        position: 'absolute', top: 3,
        left: value ? 24 : 3,
        width: 18, height: 18, borderRadius: '50%',
        background: value ? '#03060d' : C.sub,
        transition: 'left 0.2s',
      }} />
    </div>
  )
}

// 공통 input 스타일 반환
function inputStyle(C) {
  return {
    width: '100%', padding: '10px 12px',
    background: C.s3, border: `1px solid ${C.line}`,
    borderRadius: 8, color: C.text, fontSize: 13,
    outline: 'none', boxSizing: 'border-box',
  }
}

// 섹션 카드 + 제목
function Section({ title, children }) {
  const C = useT()
  return (
    <div style={{
      background: C.s2, border: `1px solid ${C.line}`,
      borderRadius: 14, padding: '20px 24px', marginBottom: 16,
    }}>
      <div style={{
        fontSize: 14, fontWeight: 700, color: C.text,
        marginBottom: 16, paddingBottom: 12, borderBottom: `1px solid ${C.line}`,
      }}>
        {title}
      </div>
      {children}
    </div>
  )
}

// 알림 항목 행
function NotifRow({ label, desc, value, onChange }) {
  const C = useT()
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      paddingBottom: 14, marginBottom: 14, borderBottom: `1px solid ${C.line}`,
    }}>
      <div style={{ flex: 1, paddingRight: 16 }}>
        <div style={{ fontSize: 13, color: C.text, marginBottom: 3 }}>{label}</div>
        <div style={{ fontSize: 12, color: C.sub }}>{desc}</div>
      </div>
      <Toggle value={value} onChange={onChange} />
    </div>
  )
}

// 저장 버튼
function SaveBtn({ onClick, saving }) {
  const C = useT()
  return (
    <button
      onClick={onClick}
      disabled={saving}
      style={{
        marginTop: 8, padding: '9px 20px', borderRadius: 8, border: 'none',
        cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: 13,
        background: 'linear-gradient(135deg, #f0b840, #d4952a)', color: '#03060d',
        opacity: saving ? 0.7 : 1,
      }}
    >
      {saving ? '저장 중...' : '저장'}
    </button>
  )
}

// 저장 메시지
function SaveMsg({ msg, isError }) {
  const C = useT()
  if (!msg) return null
  return (
    <div style={{ fontSize: 12, color: isError ? C.error : C.green, marginTop: 8 }}>{msg}</div>
  )
}

export default function Settings({ profile }) {
  const C = useT()
  const { isDark, toggleTheme } = useTheme()

  // 프로필
  const [profileName, setProfileName] = useState(profile?.name ?? '')
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [profileMsg, setProfileMsg] = useState('')
  const [profileMsgError, setProfileMsgError] = useState(false)
  const [profileSaving, setProfileSaving] = useState(false)

  // 워크스페이스
  const [companyName, setCompanyName] = useState(profile?.workspace?.name ?? '')
  const [workspaceMsg, setWorkspaceMsg] = useState('')
  const [workspaceMsgError, setWorkspaceMsgError] = useState(false)
  const [workspaceSaving, setWorkspaceSaving] = useState(false)

  // 알림
  const [notifDeadline, setNotifDeadline] = useState(true)
  const [notifSupp, setNotifSupp] = useState(true)
  const [notifApproval, setNotifApproval] = useState(true)
  const [notifEmail, setNotifEmail] = useState(false)

  const setMsg = (setter, errSetter, msg, isError = false, duration = 3000) => {
    setter(msg)
    errSetter(isError)
    setTimeout(() => setter(''), duration)
  }

  const handleSaveProfile = async () => {
    setProfileSaving(true)

    // 비밀번호 변경 요청인 경우 검증
    if (newPw || confirmPw || currentPw) {
      if (!currentPw) {
        setProfileSaving(false)
        setMsg(setProfileMsg, setProfileMsgError, '현재 비밀번호를 입력해주세요.', true)
        return
      }
      if (newPw.length < 6) {
        setProfileSaving(false)
        setMsg(setProfileMsg, setProfileMsgError, '새 비밀번호는 6자 이상이어야 합니다.', true)
        return
      }
      if (newPw !== confirmPw) {
        setProfileSaving(false)
        setMsg(setProfileMsg, setProfileMsgError, '새 비밀번호가 일치하지 않습니다.', true)
        return
      }
    }

    // 이름 변경
    if (profileName.trim() && profileName.trim() !== profile?.name) {
      const { error } = await supabase
        .from('profiles')
        .update({ name: profileName.trim() })
        .eq('id', profile.id)
      if (error) {
        setProfileSaving(false)
        setMsg(setProfileMsg, setProfileMsgError, '이름 저장 중 오류가 발생했습니다.', true)
        return
      }
    }

    // 비밀번호 변경
    if (newPw) {
      const { error } = await supabase.auth.updateUser({ password: newPw })
      if (error) {
        setProfileSaving(false)
        setMsg(setProfileMsg, setProfileMsgError, '비밀번호 변경 중 오류가 발생했습니다.', true)
        return
      }
      setCurrentPw('')
      setNewPw('')
      setConfirmPw('')
    }

    setProfileSaving(false)
    setMsg(setProfileMsg, setProfileMsgError, '저장되었습니다.')
  }

  const handleSaveWorkspace = async () => {
    const workspaceId = profile?.workspace?.id
    if (!workspaceId) return
    if (!companyName.trim()) {
      setMsg(setWorkspaceMsg, setWorkspaceMsgError, '회사명을 입력해주세요.', true)
      return
    }
    setWorkspaceSaving(true)
    const { error } = await supabase
      .from('workspaces')
      .update({ name: companyName.trim() })
      .eq('id', workspaceId)
    setWorkspaceSaving(false)
    if (error) {
      setMsg(setWorkspaceMsg, setWorkspaceMsgError, '저장 중 오류가 발생했습니다.', true)
      return
    }
    setMsg(setWorkspaceMsg, setWorkspaceMsgError, '저장되었습니다.')
  }

  const planLabel = profile?.workspace?.plan
    ? profile.workspace.plan.charAt(0).toUpperCase() + profile.workspace.plan.slice(1) + ' 플랜'
    : 'Free 플랜'

  return (
    <div style={{ maxWidth: 640 }}>
      <h3 style={{ margin: '0 0 20px', color: C.text, fontFamily: 'Noto Sans KR, sans-serif' }}>설정</h3>

      {/* 섹션 1: 프로필 */}
      <Section title="프로필 설정">
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, color: C.sub, marginBottom: 6 }}>이름</div>
          <input
            value={profileName}
            onChange={e => setProfileName(e.target.value)}
            placeholder="이름 입력"
            style={inputStyle(C)}
          />
        </div>
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, color: C.sub, marginBottom: 6 }}>이메일</div>
          <input
            value={profile?.email ?? ''}
            readOnly
            style={{ ...inputStyle(C), color: C.sub, cursor: 'default' }}
          />
        </div>
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, color: C.sub, marginBottom: 6 }}>현재 비밀번호</div>
          <input
            type="password"
            value={currentPw}
            onChange={e => setCurrentPw(e.target.value)}
            placeholder="비밀번호 변경 시 입력"
            style={inputStyle(C)}
          />
        </div>
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, color: C.sub, marginBottom: 6 }}>새 비밀번호</div>
          <input
            type="password"
            value={newPw}
            onChange={e => setNewPw(e.target.value)}
            placeholder="새 비밀번호 (6자 이상)"
            style={inputStyle(C)}
          />
        </div>
        <div style={{ marginBottom: 4 }}>
          <div style={{ fontSize: 12, color: C.sub, marginBottom: 6 }}>새 비밀번호 확인</div>
          <input
            type="password"
            value={confirmPw}
            onChange={e => setConfirmPw(e.target.value)}
            placeholder="새 비밀번호 확인"
            style={inputStyle(C)}
          />
        </div>
        <SaveBtn onClick={handleSaveProfile} saving={profileSaving} />
        <SaveMsg msg={profileMsg} isError={profileMsgError} />
      </Section>

      {/* 섹션 2: 워크스페이스 (admin만) */}
      {(profile?.role === 'admin' || profile?.role === 'superadmin') && (
        <Section title="워크스페이스 설정">
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12, color: C.sub, marginBottom: 6 }}>회사명</div>
            <input
              value={companyName}
              onChange={e => setCompanyName(e.target.value)}
              placeholder="회사명 입력"
              style={inputStyle(C)}
            />
          </div>
          <div style={{ marginBottom: 4 }}>
            <div style={{ fontSize: 12, color: C.sub, marginBottom: 6 }}>현재 플랜</div>
            <input
              value={planLabel}
              readOnly
              style={{ ...inputStyle(C), color: C.sub, cursor: 'default' }}
            />
          </div>
          <SaveBtn onClick={handleSaveWorkspace} saving={workspaceSaving} />
          <SaveMsg msg={workspaceMsg} isError={workspaceMsgError} />
        </Section>
      )}

      {/* 섹션 3: 테마 */}
      <Section title="테마 설정">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 13, color: C.text, marginBottom: 3 }}>
              {isDark ? '다크 모드' : '라이트 모드'}
            </div>
            <div style={{ fontSize: 12, color: C.sub }}>
              {isDark ? '어두운 배경의 다크 테마가 활성화되어 있습니다.' : '밝은 배경의 라이트 테마가 활성화되어 있습니다.'}
            </div>
          </div>
          <Toggle value={isDark} onChange={() => toggleTheme()} />
        </div>
      </Section>

      {/* 섹션 4: 알림 */}
      <Section title="알림 설정">
        <NotifRow
          label="마감 임박 알림"
          desc="D-7 이하 신청건에 대한 알림을 받습니다."
          value={notifDeadline}
          onChange={setNotifDeadline}
        />
        <NotifRow
          label="보완요청 수신 알림"
          desc="보완요청이 도착하면 알림을 받습니다."
          value={notifSupp}
          onChange={setNotifSupp}
        />
        <NotifRow
          label="승인 결과 알림"
          desc="신청건의 승인 또는 반려 결과 알림을 받습니다."
          value={notifApproval}
          onChange={setNotifApproval}
        />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ flex: 1, paddingRight: 16 }}>
            <div style={{ fontSize: 13, color: C.text, marginBottom: 3 }}>이메일 알림 수신</div>
            <div style={{ fontSize: 12, color: C.sub }}>모든 알림을 이메일로도 수신합니다.</div>
          </div>
          <Toggle value={notifEmail} onChange={setNotifEmail} />
        </div>
      </Section>
    </div>
  )
}
