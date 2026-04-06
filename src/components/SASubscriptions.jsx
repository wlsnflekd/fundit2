import { useT } from '../theme.jsx'

const SAMPLE_SUBSCRIPTIONS = [
  {
    id: 'ws1',
    workspace: '(주)그린컨설팅',
    plan: 'pro',
    memberCount: 4,
    monthlyAmount: 49000,
    renewDate: '2026-05-03',
    status: 'active',
  },
  {
    id: 'ws2',
    workspace: '미래정책자금연구소',
    plan: 'free',
    memberCount: 2,
    monthlyAmount: 0,
    renewDate: '-',
    status: 'active',
  },
  {
    id: 'ws3',
    workspace: '한국기업지원센터',
    plan: 'enterprise',
    memberCount: 7,
    monthlyAmount: 199000,
    renewDate: '2026-04-22',
    status: 'active',
  },
  {
    id: 'ws4',
    workspace: '정책자금파트너스',
    plan: 'pro',
    memberCount: 3,
    monthlyAmount: 49000,
    renewDate: '2026-04-10',
    status: 'overdue',
  },
  {
    id: 'ws5',
    workspace: '스마트펀딩컨설팅',
    plan: 'free',
    memberCount: 1,
    monthlyAmount: 0,
    renewDate: '-',
    status: 'active',
  },
]

const PLAN_LABEL = {
  free: { label: 'Free', color: '#6b84a8' },
  pro: { label: 'Pro', color: '#1d6fe8' },
  enterprise: { label: 'Enterprise', color: '#f0b840' },
}

const STATUS_LABEL = {
  active: { label: '정상', color: '#0ea571' },
  overdue: { label: '연체', color: '#dc3545' },
  cancelled: { label: '해지', color: '#6b84a8' },
}

function formatKRW(amount) {
  if (amount === 0) return '-'
  return `${amount.toLocaleString('ko-KR')}원`
}

export default function SASubscriptions() {
  const C = useT()

  const totalMRR = SAMPLE_SUBSCRIPTIONS.reduce((acc, s) => acc + s.monthlyAmount, 0)
  const paidCount = SAMPLE_SUBSCRIPTIONS.filter(s => s.plan !== 'free').length
  const overdueCount = SAMPLE_SUBSCRIPTIONS.filter(s => s.status === 'overdue').length

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

  return (
    <div>
      {/* 요약 KPI */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        {[
          { label: '월 총 매출 (MRR)', value: `${totalMRR.toLocaleString('ko-KR')}원`, highlight: true },
          { label: '유료 구독 수', value: `${paidCount}개` },
          { label: '연체 건수', value: `${overdueCount}건`, warn: overdueCount > 0 },
          { label: '무료 플랜', value: `${SAMPLE_SUBSCRIPTIONS.filter(s => s.plan === 'free').length}개` },
        ].map(({ label, value, highlight, warn }) => (
          <div
            key={label}
            style={{
              flex: '1 1 160px',
              background: C.s2,
              border: `1px solid ${warn ? '#dc354555' : highlight ? '#f0b84044' : C.line}`,
              borderRadius: 12,
              padding: '18px 20px',
            }}
          >
            <div style={{ fontSize: 11, color: C.sub, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>
              {label}
            </div>
            <div style={{
              fontSize: 24, fontWeight: 700, fontFamily: 'Bebas Neue, sans-serif', letterSpacing: '0.04em',
              color: warn ? '#dc3545' : highlight ? '#f0b840' : C.text,
            }}>
              {value}
            </div>
          </div>
        ))}
      </div>

      {/* 구독 현황 테이블 */}
      <div style={{
        background: C.s2, border: `1px solid ${C.line}`,
        borderRadius: 12, overflow: 'hidden',
      }}>
        <div style={{ padding: '16px 20px', borderBottom: `1px solid ${C.line}` }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>워크스페이스별 구독 현황</div>
          <div style={{ fontSize: 12, color: C.sub, marginTop: 2 }}>
            전체 {SAMPLE_SUBSCRIPTIONS.length}개 워크스페이스
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: C.s1 }}>
                <th style={th}>워크스페이스</th>
                <th style={th}>플랜</th>
                <th style={{ ...th, textAlign: 'center' }}>멤버수</th>
                <th style={{ ...th, textAlign: 'right' }}>월 결제액</th>
                <th style={th}>갱신일</th>
                <th style={th}>상태</th>
              </tr>
            </thead>
            <tbody>
              {SAMPLE_SUBSCRIPTIONS.map((sub) => {
                const plan = PLAN_LABEL[sub.plan] ?? { label: sub.plan, color: C.sub }
                const status = STATUS_LABEL[sub.status] ?? { label: sub.status, color: C.sub }
                const isOverdue = sub.status === 'overdue'

                return (
                  <tr
                    key={sub.id}
                    style={{ transition: 'background 0.1s' }}
                    onMouseEnter={e => e.currentTarget.style.background = C.s3}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <td style={td}>
                      <span style={{ fontWeight: 600 }}>{sub.workspace}</span>
                    </td>
                    <td style={td}>
                      <span style={{
                        display: 'inline-block',
                        padding: '3px 10px', borderRadius: 20,
                        fontSize: 11, fontWeight: 700,
                        background: `${plan.color}22`,
                        color: plan.color,
                        border: `1px solid ${plan.color}55`,
                      }}>
                        {plan.label}
                      </span>
                    </td>
                    <td style={{ ...td, textAlign: 'center' }}>{sub.memberCount}명</td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: sub.monthlyAmount > 0 ? 600 : 400, color: sub.monthlyAmount > 0 ? C.text : C.sub }}>
                      {formatKRW(sub.monthlyAmount)}
                    </td>
                    <td style={{ ...td, color: isOverdue ? '#dc3545' : C.sub }}>
                      {sub.renewDate}
                    </td>
                    <td style={td}>
                      <span style={{
                        display: 'inline-block',
                        padding: '3px 10px', borderRadius: 20,
                        fontSize: 11, fontWeight: 700,
                        background: `${status.color}22`,
                        color: status.color,
                        border: `1px solid ${status.color}55`,
                      }}>
                        {status.label}
                      </span>
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
