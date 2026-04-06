import { useT } from '../theme.jsx'

export default function LandingPage({ onGotoLogin }) {
  const C = useT()

  const badges = ['정책자금 매칭', '신청 관리', '승인률 분석']

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #03060d 0%, #070d1a 60%, #0b1224 100%)',
      position: 'relative',
      overflow: 'hidden',
      fontFamily: 'Noto Sans KR, sans-serif',
    }}>
      {/* 배경 골드 glow */}
      <div style={{
        position: 'absolute',
        inset: 0,
        background: 'radial-gradient(ellipse at 20% 50%, rgba(240,184,64,0.07) 0%, transparent 60%)',
        pointerEvents: 'none',
      }} />
      {/* 오른쪽 블루 glow */}
      <div style={{
        position: 'absolute',
        inset: 0,
        background: 'radial-gradient(ellipse at 80% 30%, rgba(29,111,232,0.05) 0%, transparent 55%)',
        pointerEvents: 'none',
      }} />

      <div style={{
        position: 'relative',
        zIndex: 1,
        maxWidth: 520,
        width: '100%',
        padding: '0 24px',
        textAlign: 'center',
      }}>
        {/* 로고 */}
        <div style={{
          fontFamily: 'Bebas Neue, sans-serif',
          fontSize: 72,
          lineHeight: 1,
          marginBottom: 16,
          background: 'linear-gradient(135deg, #f0b840, #d4952a)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
          letterSpacing: 4,
        }}>
          FUNDIT
        </div>

        {/* 슬로건 */}
        <p style={{
          fontSize: 18,
          color: '#6b84a8',
          fontFamily: 'Noto Sans KR, sans-serif',
          fontWeight: 400,
          marginBottom: 28,
          lineHeight: 1.6,
        }}>
          정책자금 수주, FUNDIT으로 끝내세요
        </p>

        {/* 기능 뱃지 */}
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          flexWrap: 'wrap',
          gap: 12,
          marginBottom: 40,
        }}>
          {badges.map((label) => (
            <span key={label} style={{
              border: '1px solid #1c2b44',
              padding: '6px 14px',
              borderRadius: 999,
              fontSize: 12,
              color: '#6b84a8',
              background: '#0b1224',
              fontFamily: 'Noto Sans KR, sans-serif',
              letterSpacing: 0.3,
            }}>
              {label}
            </span>
          ))}
        </div>

        {/* CTA 버튼 */}
        <button
          onClick={onGotoLogin}
          style={{
            display: 'inline-block',
            background: 'linear-gradient(135deg, #f0b840, #d4952a)',
            color: '#03060d',
            border: 'none',
            padding: '14px 36px',
            borderRadius: 12,
            fontSize: 15,
            fontWeight: 700,
            fontFamily: 'Noto Sans KR, sans-serif',
            cursor: 'pointer',
            boxShadow: '0 8px 32px rgba(240,184,64,0.25)',
            letterSpacing: 0.5,
            transition: 'transform 0.15s, box-shadow 0.15s',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.transform = 'translateY(-2px)'
            e.currentTarget.style.boxShadow = '0 12px 40px rgba(240,184,64,0.35)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.transform = 'translateY(0)'
            e.currentTarget.style.boxShadow = '0 8px 32px rgba(240,184,64,0.25)'
          }}
        >
          무료로 시작하기
        </button>

        {/* 로그인 링크 */}
        <div style={{ marginTop: 20 }}>
          <button
            onClick={onGotoLogin}
            style={{
              background: 'none',
              border: 'none',
              color: '#6b84a8',
              fontSize: 13,
              cursor: 'pointer',
              fontFamily: 'Noto Sans KR, sans-serif',
            }}
          >
            이미 계정이 있으신가요?{' '}
            <span style={{ color: '#f0b840', textDecoration: 'underline' }}>
              로그인
            </span>
          </button>
        </div>
      </div>
    </div>
  )
}
