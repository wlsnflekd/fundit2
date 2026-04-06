import { useT } from '../theme.jsx'

const SAMPLE_KPI = {
  totalWorkspaces: 5,
  activeUsers: 17,
  thisMonthApplications: 43,
  approvalRate: 68,
}

const SAMPLE_WORKSPACE_STATS = [
  {
    id: 'ws1',
    name: '(주)그린컨설팅',
    plan: 'pro',
    members: 4,
    totalApplications: 18,
    approved: 12,
    pending: 4,
    totalAmount: 720000000,
  },
  {
    id: 'ws2',
    name: '미래정책자금연구소',
    plan: 'free',
    members: 2,
    totalApplications: 6,
    approved: 3,
    pending: 2,
    totalAmount: 150000000,
  },
  {
    id: 'ws3',
    name: '한국기업지원센터',
    plan: 'enterprise',
    members: 7,
    totalApplications: 34,
    approved: 25,
    pending: 7,
    totalAmount: 1850000000,
  },
  {
    id: 'ws4',
    name: '정책자금파트너스',
    plan: 'pro',
    members: 3,
    totalApplications: 11,
    approved: 6,
    pending: 3,
    totalAmount: 330000000,
  },
  {
    id: 'ws5',
    name: '스마트펀딩컨설팅',
    plan: 'free',
    members: 1,
    totalApplications: 2,
    approved: 1,
    pending: 1,
    totalAmount: 50000000,
  },
]

const PLAN_COLOR = {
  free: '#6b84a8',
  pro: '#1d6fe8',
  enterprise: '#f0b840',
}

const PLAN_LABEL = {
  free: 'Free',
  pro: 'Pro',
  enterprise: 'Enterprise',
}

function formatAmount(n) {
  if (n >= 100000000) return `${(n / 100000000).toFixed(1)}억`
  if (n >= 10000) return `${(n / 10000).toFixed(0)}만`
  return `${n.toLocaleString()}`
}

export default function SAStats() {
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

  const totalApplications = SAMPLE_WORKSPACE_STATS.reduce((acc, w) => acc + w.totalApplications, 0)
  const totalApproved = SAMPLE_WORKSPACE_STATS.reduce((acc, w) => acc + w.approved, 0)
  const totalAmount = SAMPLE_WORKSPACE_STATS.reduce((acc, w) => acc + w.totalAmount, 0)

  return (
    <div>
      {/* KPI 카드 */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        {[
          { label: '전체 워크스페이스', value: SAMPLE_KPI.totalWorkspaces, suffix: '개', color: C.text },
          { label: '활성 사용자', value: SAMPLE_KPI.activeUsers, suffix: '명', color: C.text },
          { label: '이번달 신청건', value: SAMPLE_KPI.thisMonthApplications, suffix: '건', color: '#1d6fe8' },
          { label: '전체 승인율', value: `${SAMPLE_KPI.approvalRate}`, suffix: '%', color: '#0ea571' },
        ].map(({ label, value, suffix, color }) => (
          <div
            key={label}
            style={{
              flex: '1 1 160px',
              background: C.s2,
              border: `1px solid ${C.line}`,
              borderRadius: 12,
              padding: '18px 20px',
            }}
          >
            <div style={{ fontSize: 11, color: C.sub, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>
              {label}
            </div>
            <div style={{ fontSize: 28, fontWeight: 700, fontFamily: 'Bebas Neue, sans-serif', letterSpacing: '0.04em', color }}>
              {value}<span style={{ fontSize: 16, marginLeft: 2 }}>{suffix}</span>
            </div>
          </div>
        ))}
      </div>

      {/* 전체 집계 요약 바 */}
      <div style={{
        background: C.s2, border: `1px solid ${C.line}`,
        borderRadius: 12, padding: '18px 24px',
        marginBottom: 20,
        display: 'flex', gap: 32, flexWrap: 'wrap', alignItems: 'center',
      }}>
        <div>
          <div style={{ fontSize: 11, color: C.sub, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
            전체 신청건
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: C.text }}>{totalApplications}건</div>
        </div>
        <div style={{ width: 1, height: 36, background: C.line, flexShrink: 0 }} />
        <div>
          <div style={{ fontSize: 11, color: C.sub, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
            전체 승인건
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#0ea571' }}>{totalApproved}건</div>
        </div>
        <div style={{ width: 1, height: 36, background: C.line, flexShrink: 0 }} />
        <div>
          <div style={{ fontSize: 11, color: C.sub, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
            전체 지원금액
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#f0b840' }}>{formatAmount(totalAmount)}</div>
        </div>
        <div style={{ flex: 1, minWidth: 120 }}>
          {/* 승인률 프로그레스 바 */}
          <div style={{ fontSize: 11, color: C.sub, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
            전체 승인률
          </div>
          <div style={{ height: 8, background: C.s3, borderRadius: 4, overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              width: `${Math.round((totalApproved / totalApplications) * 100)}%`,
              background: 'linear-gradient(90deg, #0ea571, #1d6fe8)',
              borderRadius: 4,
              transition: 'width 0.4s ease',
            }} />
          </div>
          <div style={{ fontSize: 11, color: C.sub, marginTop: 4 }}>
            {Math.round((totalApproved / totalApplications) * 100)}% ({totalApproved}/{totalApplications})
          </div>
        </div>
      </div>

      {/* 워크스페이스별 현황 테이블 */}
      <div style={{
        background: C.s2, border: `1px solid ${C.line}`,
        borderRadius: 12, overflow: 'hidden',
      }}>
        <div style={{ padding: '16px 20px', borderBottom: `1px solid ${C.line}` }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>워크스페이스별 실적 현황</div>
          <div style={{ fontSize: 12, color: C.sub, marginTop: 2 }}>
            전체 {SAMPLE_WORKSPACE_STATS.length}개 워크스페이스 성과 비교
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: C.s1 }}>
                <th style={th}>워크스페이스</th>
                <th style={th}>플랜</th>
                <th style={{ ...th, textAlign: 'center' }}>멤버</th>
                <th style={{ ...th, textAlign: 'center' }}>신청건</th>
                <th style={{ ...th, textAlign: 'center' }}>승인</th>
                <th style={{ ...th, textAlign: 'center' }}>진행중</th>
                <th style={{ ...th, textAlign: 'right' }}>지원금액</th>
                <th style={th}>승인률</th>
              </tr>
            </thead>
            <tbody>
              {SAMPLE_WORKSPACE_STATS.map((ws) => {
                const planColor = PLAN_COLOR[ws.plan] ?? C.sub
                const rate = ws.totalApplications > 0
                  ? Math.round((ws.approved / ws.totalApplications) * 100)
                  : 0

                return (
                  <tr
                    key={ws.id}
                    style={{ transition: 'background 0.1s' }}
                    onMouseEnter={e => e.currentTarget.style.background = C.s3}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <td style={td}>
                      <span style={{ fontWeight: 600 }}>{ws.name}</span>
                    </td>
                    <td style={td}>
                      <span style={{
                        display: 'inline-block',
                        padding: '2px 8px', borderRadius: 20,
                        fontSize: 10, fontWeight: 700,
                        background: `${planColor}22`,
                        color: planColor,
                        border: `1px solid ${planColor}55`,
                      }}>
                        {PLAN_LABEL[ws.plan] ?? ws.plan}
                      </span>
                    </td>
                    <td style={{ ...td, textAlign: 'center', color: C.sub }}>{ws.members}명</td>
                    <td style={{ ...td, textAlign: 'center' }}>{ws.totalApplications}</td>
                    <td style={{ ...td, textAlign: 'center', color: '#0ea571', fontWeight: 600 }}>{ws.approved}</td>
                    <td style={{ ...td, textAlign: 'center', color: '#1d6fe8' }}>{ws.pending}</td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{formatAmount(ws.totalAmount)}</td>
                    <td style={{ ...td }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ flex: 1, height: 6, background: C.s3, borderRadius: 3, overflow: 'hidden', minWidth: 60 }}>
                          <div style={{
                            height: '100%',
                            width: `${rate}%`,
                            background: rate >= 70 ? '#0ea571' : rate >= 50 ? '#f0b840' : '#dc3545',
                            borderRadius: 3,
                          }} />
                        </div>
                        <span style={{ fontSize: 12, color: C.sub, minWidth: 32 }}>{rate}%</span>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
