import { lazy, Suspense, useEffect, useRef, useState, useMemo, Component } from 'react'
import { ThemeProvider, useT, useIsMobile } from './theme.jsx'
import BottomTabBar from './components/BottomTabBar.jsx'
import { supabase, getProfile, signUp, joinWorkspace, translateError, clearMustChangePassword, getNotifications, markNotificationRead, markAllNotificationsRead } from './supabase.js'

// lazy 컴포넌트 렌더링 에러를 잡아 검은 화면 대신 안내 UI를 표시
class PageErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }
  componentDidCatch(error, info) {
    console.error('[PageErrorBoundary]', error, info)
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', minHeight: 240, gap: 12,
          color: 'var(--sub)', fontSize: 13,
        }}>
          <span style={{ fontSize: 28 }}>⚠</span>
          <span>페이지를 불러오는 중 오류가 발생했습니다.</span>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{
              marginTop: 4, padding: '6px 16px', borderRadius: 8,
              border: '1px solid var(--line)', background: 'transparent',
              color: 'var(--sub)', cursor: 'pointer', fontSize: 12,
            }}
          >
            다시 시도
          </button>
          {this.state.error && (
            <span style={{ fontSize: 11, opacity: 0.5, maxWidth: 400, textAlign: 'center' }}>
              {String(this.state.error.message || this.state.error)}
            </span>
          )}
        </div>
      )
    }
    return this.props.children
  }
}

// 인증 전 즉시 필요한 컴포넌트 — 정적 import 유지
import LandingPage from './components/Landing.jsx'
import LoginPage from './components/Login.jsx'

// 앱 진입 후 탭별로 필요한 컴포넌트 — lazy import로 code splitting
// 각 컴포넌트는 해당 탭 최초 방문 시에만 로드됨
const Dashboard          = lazy(() => import('./components/Dashboard.jsx'))
const Customers          = lazy(() => import('./components/Customers.jsx'))
const Applications       = lazy(() => import('./components/Applications.jsx'))
const Funds              = lazy(() => import('./components/Funds.jsx'))
const Calendar           = lazy(() => import('./components/Calendar.jsx'))
const Team               = lazy(() => import('./components/Team.jsx'))
const Stats              = lazy(() => import('./components/Stats.jsx'))
const Settings           = lazy(() => import('./components/Settings.jsx'))
const CustomerDistribution = lazy(() => import('./components/CustomerDistribution.jsx'))
const SAWorkspaces       = lazy(() => import('./components/SAWorkspaces.jsx'))
const SAApprovals        = lazy(() => import('./components/SAApprovals.jsx'))
const SASubscriptions    = lazy(() => import('./components/SASubscriptions.jsx'))
const SAStats            = lazy(() => import('./components/SAStats.jsx'))

const ADMIN_TABS = [
  { id: 'dashboard',    label: '대시보드',          icon: '▦' },
  { id: 'customers',   label: '고객사 관리 (전체)', icon: '◉' },
  { id: 'my-customers',label: '고객사 관리 (내 고객사)', icon: '◎' },
  { id: 'applications',label: '신청건 관리',        icon: '◈' },
  { id: 'funds',       label: '정책자금',           icon: '◎' },
  { id: 'schedule',    label: '일정 관리',          icon: '◷' },
  { id: 'distribution',label: '고객사 배분',        icon: '◐' },
  { id: 'team',        label: '팀 관리',            icon: '◑' },
  { id: 'stats',       label: '통계',               icon: '◬' },
  { id: 'settings',    label: '설정',               icon: '◌' },
]

const CONSULTANT_TABS = [
  { id: 'dashboard',       label: '대시보드',  icon: '▦' },
  { id: 'my-customers',    label: '내 고객사', icon: '◉' },
  { id: 'my-applications', label: '내 신청건', icon: '◈' },
  { id: 'funds',           label: '정책자금',  icon: '◎' },
  { id: 'schedule',        label: '일정 관리', icon: '◷' },
  { id: 'settings',        label: '설정',      icon: '◌' },
]

const SUPERADMIN_TABS = [
  { id: 'sa-workspaces',    label: '워크스페이스 관리', icon: '▣' },
  { id: 'sa-approvals',     label: '가입 승인',         icon: '✓' },
  { id: 'sa-subscriptions', label: '구독 현황',         icon: '◆' },
  { id: 'sa-stats',         label: '전체 통계',         icon: '◬' },
]

function PendingScreen({ profile, onLogout }) {
  const C = useT()

  const roleGuide =
    profile?.role === 'superadmin'
      ? '슈퍼관리자의 승인이 필요합니다.'
      : profile?.role === 'admin'
      ? '슈퍼관리자의 승인이 필요합니다.'
      : '소속 워크스페이스 관리자의 승인이 필요합니다.'

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      minHeight: '100vh',
      background: C.base,
      // 랜딩과 동일한 배경 glow 효과
      backgroundImage: `
        radial-gradient(ellipse 60% 50% at 20% 50%, #f0b84012 0%, transparent 70%),
        radial-gradient(ellipse 50% 40% at 80% 50%, #1d6fe812 0%, transparent 70%)
      `,
    }}>
      <div style={{
        background: C.s2,
        border: `1px solid ${C.line}`,
        borderRadius: 20,
        padding: '48px 40px',
        width: '100%',
        maxWidth: 440,
        textAlign: 'center',
        boxShadow: '0 8px 40px rgba(0,0,0,0.3)',
      }}>
        {/* FUNDIT 로고 */}
        <div style={{
          fontFamily: 'Bebas Neue, sans-serif',
          fontSize: 36,
          letterSpacing: '0.12em',
          background: 'linear-gradient(135deg, #f0b840, #d4952a)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          marginBottom: 32,
          lineHeight: 1,
        }}>
          FUNDIT
        </div>

        {/* 아이콘 영역 */}
        <div style={{
          width: 64, height: 64, borderRadius: '50%',
          background: '#f0b84020',
          border: '2px solid #f0b84055',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 28, margin: '0 auto 24px',
        }}>
          ...
        </div>

        {/* 제목 */}
        <div style={{
          fontSize: 20, fontWeight: 700, color: C.text, marginBottom: 12,
        }}>
          승인 대기 중
        </div>

        {/* 설명 */}
        <div style={{
          fontSize: 14, color: C.sub, lineHeight: 1.7, marginBottom: 8,
        }}>
          관리자 승인 후 서비스를 이용하실 수 있습니다.
        </div>

        {/* 역할별 안내 */}
        <div style={{
          fontSize: 13, color: '#f0b840',
          background: '#f0b84012',
          border: '1px solid #f0b84033',
          borderRadius: 10,
          padding: '12px 16px',
          marginBottom: 32,
          lineHeight: 1.6,
        }}>
          {roleGuide}
        </div>

        {/* 가입한 계정 정보 */}
        {profile?.email && (
          <div style={{
            fontSize: 12, color: C.sub, marginBottom: 28,
            padding: '10px 14px',
            background: C.s3,
            borderRadius: 8,
          }}>
            <span style={{ color: C.sub }}>로그인 계정: </span>
            <span style={{ color: C.text, fontWeight: 500 }}>{profile.email}</span>
          </div>
        )}

        {/* 로그아웃 버튼 */}
        <button
          onClick={onLogout}
          style={{
            width: '100%',
            padding: '12px',
            borderRadius: 10,
            border: `1px solid ${C.line}`,
            background: 'transparent',
            color: C.sub,
            fontSize: 13,
            fontWeight: 500,
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = C.s3
            e.currentTarget.style.color = C.text
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'transparent'
            e.currentTarget.style.color = C.sub
          }}
        >
          로그아웃
        </button>
      </div>
    </div>
  )
}

function ForcePasswordChangeOverlay({ profile, onDone }) {
  const C = useT()
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(false)

  const handleChange = async () => {
    if (newPw.length < 6) { setStatus('비밀번호는 6자 이상이어야 합니다.'); return }
    if (newPw !== confirmPw) { setStatus('비밀번호가 일치하지 않습니다.'); return }
    setLoading(true)
    setStatus('')
    const { error } = await supabase.auth.updateUser({ password: newPw })
    if (error) { setStatus('비밀번호 변경 중 오류가 발생했습니다.'); setLoading(false); return }
    await clearMustChangePassword(profile.id)
    setLoading(false)
    onDone()
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9200,
      background: 'rgba(0,0,0,0.8)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: C.s2, border: `1px solid ${C.gold}55`,
        borderRadius: 20, padding: '40px 36px',
        width: '100%', maxWidth: 400,
        boxShadow: '0 12px 60px rgba(0,0,0,0.6)',
      }}>
        {/* 로고 */}
        <div style={{
          fontFamily: 'Bebas Neue, sans-serif', fontSize: 28,
          letterSpacing: '0.1em',
          background: 'linear-gradient(135deg, #f0b840, #d4952a)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          marginBottom: 24, textAlign: 'center',
        }}>
          FUNDIT
        </div>

        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 8 }}>
            비밀번호 변경이 필요합니다
          </div>
          <div style={{ fontSize: 13, color: C.sub, lineHeight: 1.6 }}>
            관리자가 임시 비밀번호를 발급했습니다.<br />
            새 비밀번호로 변경한 후 서비스를 이용해주세요.
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
          <input
            type="password"
            placeholder="새 비밀번호 (6자 이상)"
            value={newPw}
            onChange={e => setNewPw(e.target.value)}
            style={{
              padding: '11px 14px',
              background: C.s3, border: `1px solid ${C.line}`,
              borderRadius: 10, color: C.text, fontSize: 13, outline: 'none',
            }}
          />
          <input
            type="password"
            placeholder="새 비밀번호 확인"
            value={confirmPw}
            onChange={e => setConfirmPw(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleChange()}
            style={{
              padding: '11px 14px',
              background: C.s3, border: `1px solid ${C.line}`,
              borderRadius: 10, color: C.text, fontSize: 13, outline: 'none',
            }}
          />
        </div>

        {status && (
          <div style={{ fontSize: 12, color: C.error, marginBottom: 12, textAlign: 'center' }}>
            {status}
          </div>
        )}

        <button
          onClick={handleChange}
          disabled={loading}
          style={{
            width: '100%', padding: '12px', borderRadius: 10, border: 'none',
            background: 'linear-gradient(135deg, #f0b840, #d4952a)',
            color: '#03060d', fontSize: 14, fontWeight: 700,
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? '변경 중...' : '비밀번호 변경'}
        </button>
      </div>
    </div>
  )
}

// 상대 시간 포맷: "방금 전", "N분 전", "N시간 전", "N일 전"
function relativeTime(dateStr) {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (diff < 60) return '방금 전'
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`
  return `${Math.floor(diff / 86400)}일 전`
}

function NotificationBell({ profile, notifRefreshSignal = 0 }) {
  const C = useT()
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(false)
  const dropdownRef = useRef(null)

  const unreadCount = notifications.filter(n => !n.is_read).length

  const loadNotifications = async () => {
    setLoading(true)
    const { data } = await getNotifications()
    setNotifications(data ?? [])
    setLoading(false)
  }

  // 초기 로드: 마운트 직후가 아니라 2초 뒤에 첫 호출
  // — 앱 최초 진입 시 Dashboard/supabase 초기 쿼리와 네트워크 경합 방지
  useEffect(() => {
    const initialDelay = setTimeout(() => {
      loadNotifications()
    }, 2000)

    // 이후 60초마다 폴링 (기존 30초 → 60초로 완화)
    const interval = setInterval(loadNotifications, 60000)

    return () => {
      clearTimeout(initialDelay)
      clearInterval(interval)
    }
  }, [])

  // 브라우저 탭이 다시 포커스를 받으면 갱신 (30초 이내 재호출 방지)
  useEffect(() => {
    let lastFetch = 0
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastFetch > 30000) {
        lastFetch = Date.now()
        loadNotifications()
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [])

  // MainApp의 popup 구독이 새 알림을 받으면 notifRefreshSignal이 증가 → 목록 갱신
  useEffect(() => {
    if (notifRefreshSignal > 0) loadNotifications()
  }, [notifRefreshSignal]) // eslint-disable-line react-hooks/exhaustive-deps

  // 드롭다운 외부 클릭 시 닫기
  useEffect(() => {
    if (!open) return
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  const handleBellClick = () => {
    setOpen(prev => !prev)
    if (!open) loadNotifications()
  }

  const handleNotificationClick = async (n) => {
    if (!n.is_read) {
      await markNotificationRead(n.id)
      setNotifications(prev => prev.map(item => item.id === n.id ? { ...item, is_read: true } : item))
    }
  }

  const handleMarkAllRead = async () => {
    await markAllNotificationsRead()
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
  }

  return (
    <div style={{ position: 'relative' }} ref={dropdownRef}>
      {/* 벨 버튼 */}
      <button
        onClick={handleBellClick}
        style={{
          position: 'relative',
          background: 'none', border: 'none',
          cursor: 'pointer', padding: '4px 6px',
          color: open ? C.gold : C.sub,
          fontSize: 18, lineHeight: 1,
          display: 'flex', alignItems: 'center',
          borderRadius: 8,
          transition: 'color 0.15s',
        }}
        title="알림"
      >
        ◫
        {unreadCount > 0 && (
          <span style={{
            position: 'absolute', top: 0, right: 0,
            minWidth: 16, height: 16, borderRadius: 8,
            background: '#dc3545', color: '#fff',
            fontSize: 10, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '0 4px', lineHeight: 1,
            pointerEvents: 'none',
          }}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* 드롭다운 — 모바일에서 right: 0 고정으로 화면 밖 이탈 방지 */}
      {open && (
        <div style={{
          position: 'fixed', top: 56, right: 8,
          width: 'min(320px, calc(100vw - 16px))', maxHeight: '60dvh', overflowY: 'auto',
          background: C.s2, border: `1px solid ${C.line}`,
          borderRadius: 14, zIndex: 500,
          boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
          WebkitOverflowScrolling: 'touch',
        }}>
          {/* 드롭다운 헤더 */}
          <div style={{
            padding: '12px 16px', borderBottom: `1px solid ${C.line}`,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            position: 'sticky', top: 0, background: C.s2, zIndex: 1,
          }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>알림</span>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontSize: 11, color: C.gold, fontWeight: 600,
                  padding: 0, fontFamily: 'Noto Sans KR, sans-serif',
                }}
              >
                모두 읽음
              </button>
            )}
          </div>

          {/* 알림 목록 */}
          {loading ? (
            <div style={{ padding: '20px 16px', textAlign: 'center', color: C.sub, fontSize: 13 }}>불러오는 중...</div>
          ) : notifications.length === 0 ? (
            <div style={{ padding: '28px 16px', textAlign: 'center', color: C.sub, fontSize: 13 }}>알림이 없습니다</div>
          ) : (
            notifications.map((n, i) => (
              <div
                key={n.id}
                onClick={() => handleNotificationClick(n)}
                style={{
                  padding: '12px 16px',
                  borderBottom: i < notifications.length - 1 ? `1px solid ${C.line}` : 'none',
                  background: !n.is_read ? C.gold + '11' : 'transparent',
                  cursor: 'pointer',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = C.s3}
                onMouseLeave={e => e.currentTarget.style.background = !n.is_read ? C.gold + '11' : 'transparent'}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: C.text, flex: 1 }}>{n.title}</span>
                  {!n.is_read && (
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.gold, flexShrink: 0, marginTop: 3 }} />
                  )}
                </div>
                {n.body && <div style={{ fontSize: 12, color: C.sub, lineHeight: 1.5, marginBottom: 4 }}>{n.body}</div>}
                <div style={{ fontSize: 11, color: C.sub, opacity: 0.7 }}>{relativeTime(n.created_at)}</div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

// ─── 알림 팝업 + 띵동 소리 ────────────────────────────────────────────────────

function playDing() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.type = 'sine'
    osc.frequency.setValueAtTime(880, ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(660, ctx.currentTime + 0.12)
    gain.gain.setValueAtTime(0.25, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.0)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 1.0)
  } catch { /* 오디오 미지원 무시 */ }
}

function NotificationPopup({ queue, onRead }) {
  const C = useT()
  const [idx, setIdx] = useState(0)
  const prevIdx = useRef(-1)

  const item = queue[idx]
  const total = queue.length

  useEffect(() => {
    if (item && idx !== prevIdx.current) {
      prevIdx.current = idx
      playDing()
    }
  }, [idx, item])

  if (!item) return null

  const handleConfirm = () => {
    onRead(item.id)
    if (idx + 1 < total) {
      setIdx(i => i + 1)
    }
  }

  const typeIcon = item.type === 'schedule' ? '📅' : '🔔'

  return (
    <>
      <div style={{
        position: 'fixed', inset: 0,
        background: 'rgba(3,6,13,0.55)',
        zIndex: 910,
      }} />
      <div style={{
        position: 'fixed',
        top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        width: 360,
        background: C.s2,
        border: `1px solid ${C.line}`,
        borderTop: `3px solid ${C.gold}`,
        borderRadius: 16,
        boxShadow: '0 16px 60px rgba(0,0,0,0.6)',
        zIndex: 911,
        padding: '28px 28px 24px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <span style={{ fontSize: 20 }}>{typeIcon}</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: C.text, flex: 1 }}>{item.title}</span>
          {total > 1 && (
            <span style={{ fontSize: 11, color: C.sub, whiteSpace: 'nowrap' }}>{idx + 1} / {total}</span>
          )}
        </div>
        {item.body && (
          <div style={{
            fontSize: 13, color: C.sub, lineHeight: 1.65,
            marginBottom: 20, padding: '12px 14px',
            background: C.s3, borderRadius: 10,
          }}>
            {item.body}
          </div>
        )}
        <button
          onClick={handleConfirm}
          style={{
            width: '100%', padding: '11px',
            borderRadius: 10, border: 'none',
            background: 'linear-gradient(135deg, #f0b840, #d4952a)',
            color: '#03060d', fontSize: 13, fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          {idx + 1 < total ? `확인 (${total - idx - 1}개 더)` : '확인'}
        </button>
      </div>
    </>
  )
}

// 앱 최초 진입 시 세션 복원 대기 화면 (useT() 사용 가능 — ThemeProvider 안에서 렌더됨)
function AppLoadingScreen() {
  const C = useT()
  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      minHeight: '100vh',
      background: C.base, gap: 16,
    }}>
      <div style={{
        fontFamily: 'Bebas Neue, sans-serif',
        fontSize: 32, letterSpacing: '0.1em',
        background: 'linear-gradient(135deg, #f0b840, #d4952a)',
        WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
      }}>FUNDIT</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: C.sub, fontSize: 13 }}>
        <span style={{
          display: 'inline-block', width: 16, height: 16,
          border: `2px solid ${C.line}`, borderTopColor: C.gold,
          borderRadius: '50%', animation: 'spin 0.7s linear infinite',
        }} />
        불러오는 중...
      </div>
    </div>
  )
}

// lazy 컴포넌트 로딩 중 표시되는 fallback
// useT()를 직접 쓸 수 없으므로 CSS 변수(--sub, --line, --gold, --s1)를 사용
function PageLoadingFallback() {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      // 메인 영역 전체 높이를 채워 검은 공백이 노출되지 않도록
      minHeight: 'calc(100vh - 120px)',
      background: 'var(--s1)',
      color: 'var(--sub)',
      fontSize: 13,
      gap: 8,
    }}>
      <span style={{
        display: 'inline-block',
        width: 16,
        height: 16,
        border: '2px solid var(--line)',
        borderTopColor: 'var(--gold)',
        borderRadius: '50%',
        animation: 'spin 0.7s linear infinite',
      }} />
      불러오는 중...
    </div>
  )
}

function MainApp({ profile, onLogout, rootTab, setRootTab }) {
  const C = useT()
  const isMobile = useIsMobile()
  const [hoveredTab, setHoveredTab] = useState(null)
  const [mustChange, setMustChange] = useState(profile.must_change_password === true)

  // 알림 팝업 큐
  const [popupQueue, setPopupQueue] = useState([])
  // bell 갱신 신호 (popup 구독에서 새 알림 수신 시 NotificationBell에 전달)
  const [notifRefreshSignal, setNotifRefreshSignal] = useState(0)

  const handlePopupRead = async (id) => {
    await markNotificationRead(id)
    setPopupQueue(prev => prev.filter(n => n.id !== id))
  }

  // 앱 로드 시: 일정 하루 전 알림 체크 + 미확인 알림 팝업
  useEffect(() => {
    const run = async () => {
      // 1. 일정 하루 전 알림 체크 (하루 1회만, localStorage 디덥)
      const today = new Date().toISOString().slice(0, 10)
      const lastCheck = localStorage.getItem('fundit_schedule_check')
      if (lastCheck !== today) {
        localStorage.setItem('fundit_schedule_check', today)
        const tomorrow = new Date()
        tomorrow.setDate(tomorrow.getDate() + 1)
        const tomorrowStr = tomorrow.toISOString().slice(0, 10)
        try {
          const { data: schedules } = await supabase
            .from('schedules')
            .select('id, title, type, date')
            .eq('date', tomorrowStr)
          if (schedules?.length) {
            const workspaceId = profile.workspace?.id || profile.workspace_id
            await Promise.all(schedules.map(s =>
              supabase.from('notifications').insert({
                workspace_id: workspaceId,
                user_id: profile.id,
                type: 'schedule',
                title: '내일 일정 알림',
                body: `"${s.title}" 일정이 내일(${tomorrowStr}) 있습니다.`,
              })
            ))
          }
        } catch (e) {
          console.warn('schedule check error:', e)
        }
      }

      // 2. 미확인 알림 팝업 표시
      const { data } = await getNotifications()
      const unread = (data ?? []).filter(n => !n.is_read)
      if (unread.length > 0) setPopupQueue(unread)
    }

    const timer = setTimeout(run, 2000)
    return () => clearTimeout(timer)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Supabase Realtime: 새 알림 INSERT 시 즉시 팝업 + bell 갱신 (단일 채널)
  useEffect(() => {
    if (!profile?.id) return
    const userId = profile.id
    let retryTimer = null
    let ch = null

    const subscribe = () => {
      // setAuth fire-and-forget: localStorage 읽기라 ~1ms 내 완료
      // WebSocket 핸드셰이크는 ~100ms 걸리므로 phx_join 전에 JWT가 확실히 설정됨
      // async/await 대신 fire-and-forget을 쓰는 이유:
      //   async subscribe()는 React Strict Mode 이중 호출 시 race condition 발생 →
      //   "cannot add postgres_changes callbacks after subscribe()" 오류
      supabase.auth.getSession().then(({ data: { session: s } }) => {
        if (s?.access_token) supabase.realtime.setAuth(s.access_token)
      }).catch(() => {})

      ch = supabase
        .channel(`notifications:${userId}`)
        .on('postgres_changes', {
          event: 'INSERT', schema: 'public', table: 'notifications',
        }, (payload) => {
          if (payload.new.user_id !== userId) return
          if (!payload.new.is_read) {
            setPopupQueue(prev => [...prev, payload.new])
            setNotifRefreshSignal(prev => prev + 1)  // bell 즉시 갱신
          }
        })
        .subscribe((status, err) => {
          if (status === 'SUBSCRIBED') console.debug('[Realtime] 알림 구독 완료')
          if (status === 'CHANNEL_ERROR') {
            // err가 undefined면 WebSocket 연결 자체가 실패한 것 (apikey 오류 또는 Realtime 비활성화)
            // Vercel 배포 후 이 오류가 발생하면: 환경변수 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 확인
            console.warn('[Realtime] 알림 구독 오류', err ?? '(err=undefined: WebSocket 연결 실패 — Vercel 환경변수 또는 Supabase Realtime 활성화 여부 확인)', '— 30초 후 재시도')
            retryTimer = setTimeout(() => {
              supabase.removeChannel(ch)
              subscribe()
            }, 30000)
          }
          if (status === 'TIMED_OUT') {
            console.warn('[Realtime] 알림 구독 타임아웃 — 30초 후 재시도')
            retryTimer = setTimeout(() => {
              supabase.removeChannel(ch)
              subscribe()
            }, 30000)
          }
        })
    }

    subscribe()
    return () => {
      clearTimeout(retryTimer)
      if (ch) supabase.removeChannel(ch)
    }
  }, [profile?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // 앱 진입 직후 모든 lazy 컴포넌트를 백그라운드에서 미리 로드
  // — 이후 탭 전환 시 Suspense fallback(로딩 화면)이 트리거되지 않음
  // — 첫 화면(대시보드) 우선 렌더 보장을 위해 200ms 지연 후 실행
  useEffect(() => {
    const timer = setTimeout(() => {
      Promise.allSettled([
        import('./components/Dashboard.jsx'),
        import('./components/Customers.jsx'),
        import('./components/Applications.jsx'),
        import('./components/Funds.jsx'),
        import('./components/Calendar.jsx'),
        import('./components/Team.jsx'),
        import('./components/Stats.jsx'),
        import('./components/Settings.jsx'),
        import('./components/CustomerDistribution.jsx'),
        import('./components/SAWorkspaces.jsx'),
        import('./components/SAApprovals.jsx'),
        import('./components/SASubscriptions.jsx'),
        import('./components/SAStats.jsx'),
      ])
    }, 200)
    return () => clearTimeout(timer)
  }, []) // MainApp 마운트 시 1회만 실행

  // superadmin은 SUPERADMIN_TABS의 첫 탭으로, 나머지는 전달된 rootTab 사용
  const defaultTab =
    profile.role === 'superadmin' ? SUPERADMIN_TABS[0].id : (rootTab || 'dashboard')
  const [activeTab, setActiveTab] = useState(defaultTab)
  // profile.role 기반으로 탭 배열 결정
  const navTabs =
    profile.role === 'superadmin' ? SUPERADMIN_TABS
    : profile.role === 'admin' ? ADMIN_TABS
    : CONSULTANT_TABS

  const currentTab = navTabs.find(t => t.id === activeTab)

  // useMemo: activeTab/profile 변경 시에만 재계산
  // 사이드바 hover 등 무관한 state 변경으로 Suspense가 재트리거되는 것을 방지
  const page = useMemo(() => {
    if (activeTab === 'sa-workspaces') return <SAWorkspaces profile={profile} />
    if (activeTab === 'sa-approvals') return <SAApprovals profile={profile} />
    if (activeTab === 'sa-subscriptions') return <SASubscriptions />
    if (activeTab === 'sa-stats') return <SAStats />
    if (activeTab === 'dashboard') return <Dashboard profile={profile} onNavigate={setActiveTab} />
    if (activeTab === 'customers') return <Customers profile={profile} />
    if (activeTab === 'my-customers') return <Customers consultantFilter={profile.id} profile={profile} />
    if (activeTab === 'applications') return <Applications profile={profile} />
    if (activeTab === 'my-applications') return <Applications consultantFilter={profile.id} profile={profile} />
    if (activeTab === 'funds') return <Funds />
    if (activeTab === 'schedule') return <Calendar profile={profile} />
    if (activeTab === 'distribution') return <CustomerDistribution profile={profile} />
    if (activeTab === 'team') return <Team profile={profile} />
    if (activeTab === 'stats') return <Stats />
    if (activeTab === 'settings') return <Settings profile={profile} onLogout={onLogout} />
    return <div>미정의 탭</div>
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, profile])

  // 현재 날짜 포맷: 2026년 4월 2일 (목)
  const now = new Date()
  const dateLabel = now.toLocaleDateString('ko-KR', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'short'
  })

  const getNavBtnStyle = (tab) => {
    const isActive = activeTab === tab.id
    const isHovered = hoveredTab === tab.id

    if (isActive) {
      return {
        display: 'flex', alignItems: 'center', gap: 10,
        width: '100%', textAlign: 'left',
        padding: '10px 16px', marginBottom: 2,
        border: 'none', borderRadius: 10, cursor: 'pointer',
        fontSize: 13, fontWeight: 700,
        background: 'linear-gradient(135deg, #f0b840 0%, #d4952a 100%)',
        color: '#03060d',
        // 활성 탭 왼쪽 포인트 바
        boxShadow: '-3px 0 0 0 #f0b840 inset',
        transition: 'all 0.15s',
      }
    }
    if (isHovered) {
      return {
        display: 'flex', alignItems: 'center', gap: 10,
        width: '100%', textAlign: 'left',
        padding: '10px 16px', marginBottom: 2,
        border: 'none', borderRadius: 10, cursor: 'pointer',
        fontSize: 13, fontWeight: 400,
        background: C.s3,
        color: C.text,
        transition: 'all 0.15s',
      }
    }
    return {
      display: 'flex', alignItems: 'center', gap: 10,
      width: '100%', textAlign: 'left',
      padding: '10px 16px', marginBottom: 2,
      border: 'none', borderRadius: 10, cursor: 'pointer',
      fontSize: 13, fontWeight: 400,
      background: 'transparent',
      color: C.sub,
      transition: 'all 0.15s',
    }
  }

  return (
    <div style={{ display: 'flex', minHeight: '100dvh', background: C.s1, color: C.text }}>

      {/* 비밀번호 강제 변경 오버레이 */}
      {mustChange && (
        <ForcePasswordChangeOverlay
          profile={profile}
          onDone={() => setMustChange(false)}
        />
      )}

      {/* 알림 팝업 */}
      {popupQueue.length > 0 && !mustChange && (
        <NotificationPopup queue={popupQueue} onRead={handlePopupRead} />
      )}

      {/* 사이드바 — 데스크탑 전용 */}
      {!isMobile && <aside style={{
        width: 240, flexShrink: 0,
        background: C.s2,
        borderRight: `1px solid ${C.line}`,
        display: 'flex', flexDirection: 'column',
        position: 'sticky', top: 0, height: '100vh', overflow: 'auto',
      }}>

        {/* 로고 영역 */}
        <div style={{ padding: '24px 20px 20px' }}>
          <div style={{
            fontFamily: 'Bebas Neue, sans-serif', fontSize: 28, letterSpacing: '0.1em',
            background: 'linear-gradient(135deg, #f0b840, #d4952a)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          }}>
            FUNDIT
          </div>
          <div style={{
            fontSize: 10, color: C.sub, letterSpacing: '0.15em',
            textTransform: 'uppercase', marginTop: 2,
          }}>
            Policy Fund CRM
          </div>
          <div style={{ height: 1, background: C.line, margin: '16px 0 8px' }} />
        </div>

        {/* 내비게이션 */}
        <nav style={{ flex: 1, padding: '0 12px', overflowY: 'auto' }}>
          {navTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              onMouseEnter={() => setHoveredTab(tab.id)}
              onMouseLeave={() => setHoveredTab(null)}
              style={getNavBtnStyle(tab)}
            >
              <span style={{ fontSize: 15, lineHeight: 1 }}>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </nav>

        {/* 프로필 + 로그아웃 */}
        <div style={{ borderTop: `1px solid ${C.line}`, padding: '16px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 12 }}>
            {/* 이니셜 아바타 */}
            <div style={{
              width: 34, height: 34, borderRadius: '50%',
              background: 'linear-gradient(135deg, #f0b840, #d4952a)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 14, fontWeight: 700, color: '#03060d',
              flexShrink: 0, lineHeight: 1, userSelect: 'none',
            }}>
              {profile.name?.[0] ?? '?'}
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              {/* 이름: 한 줄 고정 */}
              <div style={{ fontSize: 13, fontWeight: 600, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {profile.name}
              </div>
              {/* 회사명: 2줄까지 줄바꿈 허용 */}
              {profile.workspace?.name && (
                <div style={{
                  fontSize: 15, fontWeight: 700, color: '#d4952a', marginTop: 2,
                  display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                  overflow: 'hidden', lineHeight: 1.3,
                }}>
                  {profile.workspace.name}
                </div>
              )}
              <div style={{ fontSize: 11, color: C.sub, marginTop: 3 }}>
                {profile.role === 'superadmin' ? '슈퍼관리자'
                  : profile.role === 'admin' ? '관리자'
                  : '컨설턴트'}
              </div>
            </div>
          </div>
          <button
            onClick={onLogout}
            style={{
              width: '100%', padding: '8px', borderRadius: 8,
              background: 'transparent', border: `1px solid ${C.line}`,
              color: C.sub, fontSize: 12, cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            로그아웃
          </button>
        </div>
      </aside>}

      {/* 메인 컨텐츠 */}
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden',
        // 모바일: 하단 탭바(56px) + safe area만큼 패딩 확보
        paddingBottom: isMobile ? 'calc(56px + env(safe-area-inset-bottom, 0px))' : 0,
      }}>

        {/* 상단 헤더바 */}
        <div style={{
          padding: isMobile ? '12px 16px' : '16px 28px',
          borderBottom: `1px solid ${C.line}`,
          background: C.s2,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          {isMobile ? (
            /* 모바일 헤더: FUNDIT 로고 + 알림벨 */
            <div style={{
              fontFamily: 'Bebas Neue, sans-serif', fontSize: 22, letterSpacing: '0.1em',
              background: 'linear-gradient(135deg, #f0b840, #d4952a)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            }}>FUNDIT</div>
          ) : (
            <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 20, letterSpacing: '0.08em', color: C.text }}>
              {currentTab?.label ?? ''}
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <NotificationBell profile={profile} notifRefreshSignal={notifRefreshSignal} />
            {!isMobile && <div style={{ fontSize: 12, color: C.sub }}>{dateLabel}</div>}
          </div>
        </div>

        {/* 페이지 컨텐츠 */}
        <main style={{
          flex: 1,
          padding: isMobile ? '16px 16px' : '24px 28px',
          overflowY: 'auto',
          background: C.s1,
          WebkitOverflowScrolling: 'touch',
        }}>
          <PageErrorBoundary>
            <Suspense fallback={<PageLoadingFallback />}>
              {page}
            </Suspense>
          </PageErrorBoundary>
        </main>
      </div>

      {/* 하단 탭바 — 모바일 전용 */}
      {isMobile && (
        <BottomTabBar
          activeTab={activeTab}
          onTabChange={setActiveTab}
          role={profile.role}
        />
      )}
    </div>
  )
}

export default function App() {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  // mode: 'loading' | 'landing' | 'login' | 'pending' | 'app'
  // 'loading'  — 앱 최초 진입 시 기존 세션 복원 여부 확인 중
  // 'pending'  — 로그인 성공했지만 관리자 승인 대기 중
  const [mode, setMode] = useState('loading')
  const [authMode, setAuthMode] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [workspaceName, setWorkspaceName] = useState('')
  // signupType: 'new' = 새 워크스페이스 생성(admin), 'join' = 기존 워크스페이스 합류(consultant)
  const [signupType, setSignupType] = useState('new')
  const [status, setStatus] = useState('')
  const [authLoading, setAuthLoading] = useState(false)
  const [activeTab, setActiveTab] = useState('dashboard')

  useEffect(() => {
    let cancelled = false

    // ① getSession()으로 초기 세션을 즉시 확인
    // onAuthStateChange의 INITIAL_SESSION 발화를 기다리지 않아 'loading' 고착 방지
    // 1.5초 타임아웃: getSession이 응답하지 않을 경우 강제로 landing으로 전환 (기존 3초에서 단축)
    const timeoutId = setTimeout(() => {
      if (!cancelled) {
        console.warn('getSession timeout — 강제 landing 전환')
        setMode('landing')
      }
    }, 1500)

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      clearTimeout(timeoutId)
      if (cancelled) return
      console.debug('getSession result', session?.user?.id)
      if (!session?.user) {
        // 미로그인 상태 → 랜딩 페이지
        setMode('landing')
        return
      }
      setSession(session)
      try {
        const { data, error } = await getProfile(session.user.id)
        if (cancelled) return
        console.debug('getSession: getProfile result', { data, error })
        if (error) {
          setProfile(null)
          setStatus(`프로필 로드 오류: ${error.message}`)
          setMode('login')
        } else {
          setProfile(data)
          setStatus('')
          // approval_status가 'pending'이면 승인 대기 화면으로 전환
          setMode(data.approval_status === 'pending' ? 'pending' : 'app')
        }
      } catch (err) {
        if (cancelled) return
        console.error('getSession: getProfile exception', err)
        setProfile(null)
        setStatus(`프로필 로드 중 예외 발생: ${err.message}`)
        setMode('login')
      }
    }).catch((err) => {
      clearTimeout(timeoutId)
      if (cancelled) return
      console.error('getSession error:', err)
      setMode('landing')
    })

    // ② onAuthStateChange는 외부 변화(로그아웃, 토큰 갱신)만 처리
    // SIGNED_IN / INITIAL_SESSION은 onLogin/onSignup/getSession이 직접 처리하므로 무시
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (cancelled) return
      console.debug('onAuthStateChange', event, newSession?.user?.id)

      if (event === 'SIGNED_OUT') {
        setSession(null)
        setProfile(null)
        setMode('landing')
      } else if (event === 'TOKEN_REFRESHED' && newSession) {
        setSession(newSession)
      }
      // SIGNED_IN, INITIAL_SESSION은 무시 (onLogin/onSignup/getSession이 직접 처리)
    })

    return () => {
      cancelled = true
      clearTimeout(timeoutId)
      subscription.unsubscribe()
    }
  }, [])

  const onGotoLogin = () => setMode('login')
  const onLogout = async () => {
    await supabase.auth.signOut()
    // onAuthStateChange의 SIGNED_OUT 이벤트가 session/profile을 정리합니다.
    // 여기서는 mode만 즉시 전환합니다.
    setSession(null)
    setProfile(null)
    setMode('landing')
  }

  const onLogin = async () => {
    if (authLoading) return
    setAuthLoading(true)
    setStatus('로그인 중...')
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      console.debug('onLogin result', { data, error })
      if (error) { setStatus(translateError(error)); setAuthLoading(false); return }

      setSession(data.session)
      const { data: profileData, error: profileError } = await getProfile(data.user.id)
      console.debug('onLogin: getProfile result', { profileData, profileError })
      if (profileError) { setStatus(translateError(profileError)); setAuthLoading(false); return }

      setProfile(profileData)
      setStatus('')
      setAuthLoading(false)
      // approval_status가 'pending'이면 승인 대기 화면으로 전환
      setMode(profileData.approval_status === 'pending' ? 'pending' : 'app')
    } catch (err) {
      console.error('onLogin exception:', err)
      setStatus(translateError(err))
      setAuthLoading(false)
    }
  }

  const onSignup = async () => {
    if (authLoading) return
    setAuthLoading(true)
    setStatus('회원가입 중...')
    try {
      let signupResult
      if (signupType === 'new') {
        // 경로 A: 새 워크스페이스 생성 (admin 역할, 슈퍼관리자 승인 대기)
        signupResult = await signUp(email, password, workspaceName || 'FUNDIT', name || 'New User')
      } else {
        // 경로 B: 기존 워크스페이스 합류 (consultant 역할, 워크스페이스 admin 승인 대기)
        if (!workspaceName.trim()) {
          setStatus('합류할 워크스페이스 이름을 입력해주세요.')
          setAuthLoading(false)
          return
        }
        signupResult = await joinWorkspace(email, password, workspaceName.trim(), name || 'New User')
      }

      const { data, error } = signupResult
      if (error) { setStatus(translateError(error)); setAuthLoading(false); return }

      // signUp/joinWorkspace 완료 후 현재 세션 확인
      const { data: sessionData } = await supabase.auth.getSession()
      const session = sessionData?.session
      if (!session) {
        // 이메일 확인 활성화 상태 — 세션 없음
        setStatus('이메일을 확인한 뒤 로그인해주세요.')
        setMode('login')
        setAuthLoading(false)
        return
      }

      setSession(session)
      const { data: profileData, error: profileError } = await getProfile(session.user.id)
      console.debug('onSignup: getProfile result', { profileData, profileError })
      if (profileError) { setStatus(translateError(profileError)); setAuthLoading(false); return }

      setProfile(profileData)
      setStatus('')
      setAuthLoading(false)
      // approval_status가 'pending'이면 승인 대기 화면으로 전환
      setMode(profileData.approval_status === 'pending' ? 'pending' : 'app')
    } catch (err) {
      console.error('onSignup exception:', err)
      setStatus(translateError(err))
      setAuthLoading(false)
    }
  }

  // 앱 초기 로딩 중 (기존 세션 복원 대기)
  if (mode === 'loading') {
    return (
      <ThemeProvider>
        <AppLoadingScreen />
      </ThemeProvider>
    )
  }

  return (
    <ThemeProvider>
      {mode === 'landing' && <LandingPage onGotoLogin={onGotoLogin} />}
      {mode === 'login' && (
        <LoginPage
          authMode={authMode}
          setAuthMode={setAuthMode}
          email={email}
          setEmail={setEmail}
          password={password}
          setPassword={setPassword}
          name={name}
          setName={setName}
          workspaceName={workspaceName}
          setWorkspaceName={setWorkspaceName}
          signupType={signupType}
          setSignupType={setSignupType}
          onLogin={onLogin}
          onSignup={onSignup}
          status={status}
          authLoading={authLoading}
        />
      )}
      {mode === 'pending' && profile && (
        <PendingScreen profile={profile} onLogout={onLogout} />
      )}
      {mode === 'app' && profile && (
        <MainApp profile={profile} onLogout={onLogout} rootTab={activeTab} setRootTab={setActiveTab} />
      )}
    </ThemeProvider>
  )
}
