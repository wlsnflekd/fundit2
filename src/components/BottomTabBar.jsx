// 모바일 하단 탭바 — App.jsx의 MainApp에서 isMobile 시 사이드바 대신 렌더
import { useT } from '../theme.jsx'

// ── 인라인 SVG 아이콘 (외부 라이브러리 없음) ──────────────────────────────

function IconHome({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  )
}

function IconPeople({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  )
}

function IconDoc({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  )
}

function IconFunds({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="1" x2="12" y2="23" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  )
}

function IconSettings({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}

// ── 탭 정의 ───────────────────────────────────────────────────────────────

const MOBILE_ADMIN_TABS = [
  { id: 'dashboard',    label: '홈',    Icon: IconHome },
  { id: 'customers',   label: '고객사', Icon: IconPeople },
  { id: 'applications',label: '신청건', Icon: IconDoc },
  { id: 'funds',       label: '정책자금', Icon: IconFunds },
  { id: 'settings',   label: '설정',   Icon: IconSettings },
]

const MOBILE_CONSULTANT_TABS = [
  { id: 'dashboard',       label: '홈',    Icon: IconHome },
  { id: 'my-customers',    label: '내 고객사', Icon: IconPeople },
  { id: 'my-applications', label: '내 신청건', Icon: IconDoc },
  { id: 'funds',           label: '정책자금', Icon: IconFunds },
  { id: 'settings',        label: '설정',   Icon: IconSettings },
]

// superadmin은 모바일 접근 가능성이 낮으므로 admin 탭 세트 폴백 사용

export default function BottomTabBar({ activeTab, onTabChange, role }) {
  const C = useT()
  const tabs = role === 'consultant' ? MOBILE_CONSULTANT_TABS : MOBILE_ADMIN_TABS

  return (
    <nav style={{
      position: 'fixed',
      left: 0, right: 0, bottom: 0,
      // iOS 홈 인디케이터 safe area (viewport-fit=cover 필요)
      paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      background: C.s2,
      borderTop: `1px solid ${C.line}`,
      display: 'flex',
      zIndex: 200,
      boxShadow: '0 -4px 20px rgba(0,0,0,0.25)',
    }}>
      {tabs.map(({ id, label, Icon }) => {
        const isActive = activeTab === id
        return (
          <button
            key={id}
            onClick={() => onTabChange(id)}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 3,
              // 터치 타겟 최소 44px (Apple HIG 기준)
              minHeight: 56,
              padding: '8px 4px',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: isActive ? C.gold : C.sub,
              transition: 'color 0.15s',
              // 활성 탭: 상단 포인트 바
              borderTop: isActive ? `2px solid ${C.gold}` : '2px solid transparent',
              userSelect: 'none',
            }}
          >
            <Icon size={20} />
            <span style={{
              fontSize: 10,
              fontFamily: 'Noto Sans KR, sans-serif',
              fontWeight: isActive ? 700 : 400,
              lineHeight: 1,
              whiteSpace: 'nowrap',
            }}>
              {label}
            </span>
          </button>
        )
      })}
    </nav>
  )
}
