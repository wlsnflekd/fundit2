import { useState, useEffect } from 'react'
import { useT } from '../theme.jsx'

export default function LoginPage({
  authMode, setAuthMode,
  email, setEmail,
  password, setPassword,
  name, setName,
  workspaceName, setWorkspaceName,
  signupType, setSignupType,
  onLogin, onSignup,
  status,
  authLoading,
}) {
  const C = useT()
  const [focused, setFocused] = useState(null)
  const [rememberEmail, setRememberEmail] = useState(() =>
    localStorage.getItem('rememberEmail') === 'true'
  )

  // 페이지 로드 시 저장된 이메일 자동 입력
  useEffect(() => {
    if (localStorage.getItem('rememberEmail') === 'true') {
      const saved = localStorage.getItem('savedEmail')
      if (saved) setEmail(saved)
    }
  // setEmail은 App.jsx에서 내려오는 안정적인 setter이므로 의존성 배열 생략 가능
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleRememberChange = (e) => {
    const checked = e.target.checked
    setRememberEmail(checked)
    if (checked) {
      localStorage.setItem('rememberEmail', 'true')
      localStorage.setItem('savedEmail', email)
    } else {
      localStorage.removeItem('rememberEmail')
      localStorage.removeItem('savedEmail')
    }
  }

  // 로그인 시 체크된 상태라면 현재 이메일도 갱신
  const handleLoginWithSave = () => {
    if (rememberEmail) {
      localStorage.setItem('savedEmail', email)
    }
    onLogin()
  }

  const inputStyle = (fieldName) => ({
    width: '100%',
    padding: '12px 14px',
    background: '#0b1224',
    border: `1px solid ${focused === fieldName ? '#f0b840' : '#1c2b44'}`,
    borderRadius: 10,
    color: '#eaf0ff',
    fontSize: 14,
    outline: 'none',
    marginBottom: 10,
    fontFamily: 'Noto Sans KR, sans-serif',
    boxSizing: 'border-box',
    transition: 'border-color 0.15s',
  })

  const isError = status && (
    status.includes('실패') ||
    status.includes('오류') ||
    status.includes('없') ||
    status.includes('잘못') ||
    status.includes('확인') ||
    status.includes('error') ||
    status.includes('Error')
  )

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      fontFamily: 'Noto Sans KR, sans-serif',
    }}>
      {/* 왼쪽 브랜딩 패널 */}
      <div style={{
        width: '40%',
        flexShrink: 0,
        background: 'linear-gradient(160deg, #070d1a, #0b1224)',
        borderRight: '1px solid #1c2b44',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '48px 40px',
        position: 'relative',
        overflow: 'hidden',
      }}
        className="login-brand-panel"
      >
        {/* 배경 glow */}
        <div style={{
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(ellipse at 50% 40%, rgba(240,184,64,0.06) 0%, transparent 65%)',
          pointerEvents: 'none',
        }} />

        <div style={{ position: 'relative', zIndex: 1, textAlign: 'center' }}>
          {/* 로고 */}
          <div style={{
            fontFamily: 'Bebas Neue, sans-serif',
            fontSize: 56,
            lineHeight: 1,
            marginBottom: 14,
            background: 'linear-gradient(135deg, #f0b840, #d4952a)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            letterSpacing: 3,
          }}>
            FUNDIT
          </div>

          {/* 슬로건 */}
          <p style={{
            fontSize: 16,
            color: '#6b84a8',
            marginBottom: 48,
            lineHeight: 1.6,
          }}>
            정책자금 수주, FUNDIT으로 끝내세요
          </p>

          {/* 기능 리스트 */}
          <div style={{ textAlign: 'left' }}>
            {[
              '정책자금 통합 관리',
              '실시간 신청 현황 추적',
              '팀 협업 & 성과 분석',
            ].map((text) => (
              <div key={text} style={{
                fontSize: 13,
                color: '#6b84a8',
                padding: '6px 0',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
              }}>
                <span style={{ color: '#f0b840', fontSize: 10 }}>✦</span>
                {text}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 오른쪽 폼 패널 */}
      <div style={{
        flex: 1,
        background: '#070d1a',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 24px',
      }}>
        <div style={{ width: '100%', maxWidth: 380 }}>
          {/* 탭 */}
          <div style={{
            display: 'flex',
            gap: 28,
            marginBottom: 32,
            borderBottom: '1px solid #1c2b44',
          }}>
            {[
              { key: 'login', label: '로그인' },
              { key: 'signup', label: '회원가입' },
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setAuthMode(key)}
                style={{
                  background: 'none',
                  border: 'none',
                  borderBottom: authMode === key ? '2px solid #f0b840' : '2px solid transparent',
                  paddingBottom: 10,
                  marginBottom: -1,
                  fontSize: 15,
                  fontWeight: authMode === key ? 700 : 400,
                  color: authMode === key ? '#f0b840' : '#6b84a8',
                  cursor: 'pointer',
                  fontFamily: 'Noto Sans KR, sans-serif',
                  transition: 'color 0.15s',
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {/* 회원가입 유형 토글 — 이메일 위에 표시 */}
          {authMode === 'signup' && (
            <div style={{
              display: 'flex',
              gap: 6,
              marginBottom: 14,
              background: '#0b1224',
              border: '1px solid #1c2b44',
              borderRadius: 10,
              padding: 4,
            }}>
              {[
                { key: 'new',  label: '관리자' },
                { key: 'join', label: '컨설턴트' },
              ].map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setSignupType(key)}
                  style={{
                    flex: 1,
                    padding: '8px 6px',
                    borderRadius: 7,
                    border: 'none',
                    background: signupType === key ? '#f0b840' : 'transparent',
                    color: signupType === key ? '#03060d' : '#6b84a8',
                    fontSize: 13,
                    fontWeight: signupType === key ? 700 : 400,
                    cursor: 'pointer',
                    fontFamily: 'Noto Sans KR, sans-serif',
                    transition: 'background 0.15s, color 0.15s',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          {/* 입력 필드 */}
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onFocus={() => setFocused('email')}
            onBlur={() => setFocused(null)}
            placeholder="이메일"
            type="email"
            style={inputStyle('email')}
          />

          {/* 아이디 기억하기 — 로그인 탭에서만 표시 */}
          {authMode === 'login' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 8px 0' }}>
              <input
                type="checkbox"
                id="rememberEmail"
                checked={rememberEmail}
                onChange={handleRememberChange}
                style={{ cursor: 'pointer', accentColor: C.gold }}
              />
              <label
                htmlFor="rememberEmail"
                style={{ fontSize: 13, color: C.sub, cursor: 'pointer' }}
              >
                아이디 기억하기
              </label>
            </div>
          )}

          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onFocus={() => setFocused('password')}
            onBlur={() => setFocused(null)}
            onKeyDown={(e) => { if (e.key === 'Enter' && authMode === 'login' && !authLoading) handleLoginWithSave() }}
            placeholder="비밀번호"
            type="password"
            style={inputStyle('password')}
          />

          {authMode === 'signup' && (
            <>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                onFocus={() => setFocused('name')}
                onBlur={() => setFocused(null)}
                placeholder="이름"
                style={inputStyle('name')}
              />

              {signupType === 'new' ? (
                <input
                  value={workspaceName}
                  onChange={(e) => setWorkspaceName(e.target.value)}
                  onFocus={() => setFocused('workspace')}
                  onBlur={() => setFocused(null)}
                  placeholder="워크스페이스 이름 (회사명)"
                  style={inputStyle('workspace')}
                />
              ) : (
                <input
                  value={workspaceName}
                  onChange={(e) => setWorkspaceName(e.target.value)}
                  onFocus={() => setFocused('workspace')}
                  onBlur={() => setFocused(null)}
                  placeholder="회사 워크스페이스명 입력"
                  style={inputStyle('workspace')}
                />
              )}
            </>
          )}

          {/* 제출 버튼 */}
          <button
            onClick={authMode === 'login' ? handleLoginWithSave : onSignup}
            disabled={authLoading}
            style={{
              width: '100%',
              padding: '13px',
              background: 'linear-gradient(135deg, #f0b840, #d4952a)',
              color: '#03060d',
              border: 'none',
              borderRadius: 10,
              fontSize: 14,
              fontWeight: 700,
              fontFamily: 'Noto Sans KR, sans-serif',
              cursor: authLoading ? 'not-allowed' : 'pointer',
              opacity: authLoading ? 0.65 : 1,
              boxShadow: '0 4px 20px rgba(240,184,64,0.25)',
              letterSpacing: 0.5,
              marginTop: 4,
              transition: 'transform 0.15s, box-shadow 0.15s, opacity 0.15s',
            }}
            onMouseEnter={e => {
              if (authLoading) return
              e.currentTarget.style.transform = 'translateY(-1px)'
              e.currentTarget.style.boxShadow = '0 8px 28px rgba(240,184,64,0.35)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.transform = 'translateY(0)'
              e.currentTarget.style.boxShadow = '0 4px 20px rgba(240,184,64,0.25)'
            }}
          >
            {authLoading
              ? (authMode === 'login' ? '로그인 중...' : '처리 중...')
              : (authMode === 'login' ? '로그인하기' : '가입하기')
            }
          </button>

          {/* 상태 메시지 */}
          {status && (
            <div style={{
              marginTop: 14,
              fontSize: 13,
              color: isError ? '#e74c3c' : '#f0b840',
              fontFamily: 'Noto Sans KR, sans-serif',
              textAlign: 'center',
              lineHeight: 1.5,
            }}>
              {status}
            </div>
          )}
        </div>
      </div>

      {/* 모바일 대응 스타일 */}
      <style>{`
        @media (max-width: 768px) {
          .login-brand-panel {
            display: none !important;
          }
        }
      `}</style>
    </div>
  )
}
