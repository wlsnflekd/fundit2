// 공통 컴포넌트들
import React, { useState, useEffect } from 'react';
import { useT } from '../theme.jsx';

// 상태별 색상 매핑 — 반투명 배경 + 테두리 + 텍스트 트리플셋
const STATUS_COLOR_MAP = {
  '신청예정': { bg: '#1d6fe820', text: '#4d9eff', border: '#1d6fe840' },
  '서류준비': { bg: '#f0b84020', text: '#f0b840',  border: '#f0b84040' },
  '검토중':   { bg: '#f0b84020', text: '#f0b840',  border: '#f0b84040' },
  '보완요청': { bg: '#0ea57120', text: '#0ea571',  border: '#0ea57140' },
  '승인완료': { bg: '#0ea57120', text: '#0ea571',  border: '#0ea57140' },
  '반려':     { bg: '#e74c3c20', text: '#e74c3c',  border: '#e74c3c40' },
};

export const StatusBadge = ({ status }) => {
  const colors = STATUS_COLOR_MAP[status] ?? { bg: '#6b84a820', text: '#6b84a8', border: '#6b84a840' };
  return (
    <span style={{
      display: 'inline-block',
      padding: '3px 10px',
      borderRadius: 999,
      background: colors.bg,
      border: `1px solid ${colors.border}`,
      color: colors.text,
      fontSize: 11,
      fontWeight: 700,
      letterSpacing: '0.03em',
      whiteSpace: 'nowrap',
    }}>
      {status}
    </span>
  );
};

// Card — 두 가지 모드
//   통계카드: title + value props 사용 (상단 아이콘 영역, 굵은 숫자)
//   일반카드: children 사용 (그라디언트 보더, 짙은 그림자)
export const Card = ({ title, value, accent, icon, children, style = {} }) => {
  const C = useT();

  if (title !== undefined && value !== undefined) {
    // 통계 카드
    return (
      <div style={{
        background: C.s2,
        border: `1px solid ${C.line}`,
        borderRadius: 14,
        padding: '16px 18px',
        minWidth: 160,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        boxShadow: '0 4px 24px rgba(0,0,0,0.3)',
        ...style,
      }}>
        {/* 아이콘 + 타이틀 행 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {icon && (
            <span style={{ fontSize: 16, opacity: 0.7 }}>{icon}</span>
          )}
          <div style={{
            fontSize: 11, color: C.sub,
            textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600,
          }}>
            {title}
          </div>
        </div>
        {/* 수치 */}
        <div style={{
          fontSize: 28, fontWeight: 800,
          color: accent || C.text,
          lineHeight: 1,
        }}>
          {value}
        </div>
      </div>
    );
  }

  // 일반 카드
  return (
    <div style={{
      background: C.s2,
      border: `1px solid ${C.line}`,
      borderRadius: 16,
      padding: '16px',
      boxShadow: '0 4px 24px rgba(0,0,0,0.3)',
      ...style,
    }}>
      {children}
    </div>
  );
};

// Button — primary / secondary / danger
export const Button = ({ children, onClick, variant = 'primary', disabled, style }) => {
  const C = useT();
  const [hovered, setHovered] = useState(false);

  const variants = {
    primary: {
      background: 'linear-gradient(135deg, #f0b840 0%, #d4952a 100%)',
      color: '#03060d',
      fontWeight: 700,
      border: 'none',
      boxShadow: hovered ? '0 6px 20px rgba(240,184,64,0.45)' : '0 4px 14px rgba(240,184,64,0.3)',
    },
    secondary: {
      background: 'transparent',
      color: C.text,
      border: `1px solid ${C.line}`,
      fontWeight: 500,
      boxShadow: 'none',
    },
    danger: {
      background: 'linear-gradient(135deg, #e74c3c, #c0392b)',
      color: 'white',
      border: 'none',
      fontWeight: 700,
      boxShadow: hovered ? '0 6px 20px rgba(231,76,60,0.4)' : 'none',
    },
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: '9px 18px',
        borderRadius: 9,
        fontSize: 13,
        letterSpacing: '0.02em',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'all 0.2s',
        ...variants[variant],
        ...style,
      }}
    >
      {children}
    </button>
  );
};

// TableSkeleton — 테이블 로딩 스켈레톤 (rows행 × cols열)
// 컬럼 너비 패턴: 첫 열 넓게, 마지막 열 좁게, 나머지 중간
export const TableSkeleton = ({ rows = 5, cols = 6 }) => {
  const C = useT()
  const shimmerBase = {
    background: 'linear-gradient(90deg, var(--s3) 25%, var(--line) 50%, var(--s3) 75%)',
    backgroundSize: '400% 100%',
    animation: 'fundit-skeleton 1.4s ease infinite',
    borderRadius: 4,
    height: 13,
    display: 'block',
  }
  const widths = ['72%', '58%', '50%', '44%', '38%', '32%', '28%']
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
      <tbody>
        {Array.from({ length: rows }).map((_, i) => (
          <tr key={i} style={{ borderBottom: `1px solid ${C.line}` }}>
            {Array.from({ length: cols }).map((_, j) => (
              <td key={j} style={{ padding: '12px 12px' }}>
                <span style={{ ...shimmerBase, width: widths[j % widths.length] }} />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// CardSkeleton — KPI 카드 형태 스켈레톤 (count개)
export const CardSkeleton = ({ count = 3 }) => {
  const C = useT()
  const shimmerBase = {
    background: 'linear-gradient(90deg, var(--s3) 25%, var(--line) 50%, var(--s3) 75%)',
    backgroundSize: '400% 100%',
    animation: 'fundit-skeleton 1.4s ease infinite',
    borderRadius: 4,
    display: 'block',
  }
  return (
    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} style={{
          flex: 1, minWidth: 150,
          background: C.s2, border: `1px solid ${C.line}`,
          borderRadius: 14, padding: '16px 18px',
          display: 'flex', flexDirection: 'column', gap: 14,
        }}>
          <span style={{ ...shimmerBase, height: 10, width: '55%' }} />
          <span style={{ ...shimmerBase, height: 28, width: '40%' }} />
        </div>
      ))}
    </div>
  )
}

// DetailSkeleton — 상세 패널 탭 콘텐츠 스켈레톤
// 레이블+인풋 쌍으로 구성 (fieldCount개)
export const DetailSkeleton = ({ fieldCount = 8 }) => {
  const C = useT()
  const shimmerBase = {
    background: 'linear-gradient(90deg, var(--s3) 25%, var(--line) 50%, var(--s3) 75%)',
    backgroundSize: '400% 100%',
    animation: 'fundit-skeleton 1.4s ease infinite',
    borderRadius: 4,
    display: 'block',
  }
  const widths = ['80%', '65%', '90%', '55%', '70%', '75%', '60%', '85%']
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
      {Array.from({ length: fieldCount }).map((_, i) => (
        <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ ...shimmerBase, height: 9, width: '40%' }} />
          <span style={{ ...shimmerBase, height: 32, width: widths[i % widths.length] }} />
        </div>
      ))}
    </div>
  )
}

// BottomSheet — 모바일 슬라이드업 패널
// open/onClose로 제어, title 선택, children은 스크롤 가능
// 데스크탑에서는 렌더 안 됨 (호출 측에서 isMobile 조건으로 분기)
export const BottomSheet = ({ open, onClose, title, children }) => {
  const C = useT()
  const [mounted, setMounted] = useState(false)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (open) {
      setMounted(true)
      // 마운트 직후 두 프레임 후 visible 전환 → CSS 트랜지션이 initial → final 상태를 구분
      const raf1 = requestAnimationFrame(() => {
        requestAnimationFrame(() => setVisible(true))
      })
      return () => cancelAnimationFrame(raf1)
    } else {
      setVisible(false)
      const t = setTimeout(() => setMounted(false), 300)
      return () => clearTimeout(t)
    }
  }, [open])

  // body 스크롤 잠금 — iOS에서 시트 뒤 페이지가 스크롤되는 현상 방지
  useEffect(() => {
    if (open) {
      document.body.classList.add('modal-open')
    } else {
      document.body.classList.remove('modal-open')
    }
    return () => document.body.classList.remove('modal-open')
  }, [open])

  if (!mounted) return null

  return (
    <>
      {/* 배경 오버레이 */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(3,6,13,0.6)',
          zIndex: 300,
          opacity: visible ? 1 : 0,
          transition: 'opacity 0.25s ease',
        }}
      />
      {/* 시트 본체 */}
      <div
        style={{
          position: 'fixed', left: 0, right: 0, bottom: 0,
          // iOS 홈 인디케이터 safe area 대응 (viewport-fit=cover 필요)
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          background: C.s2,
          borderRadius: '20px 20px 0 0',
          borderTop: `1px solid ${C.line}`,
          zIndex: 301,
          maxHeight: '85dvh',
          display: 'flex',
          flexDirection: 'column',
          // transform 기반 슬라이드업 — right/bottom 변경보다 GPU 처리
          transform: visible ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 0.28s cubic-bezier(0.32, 0.72, 0, 1)',
          willChange: 'transform',
          boxShadow: '0 -8px 40px rgba(0,0,0,0.4)',
        }}
      >
        {/* 드래그 핸들 */}
        <div style={{
          width: 36, height: 4, borderRadius: 2,
          background: C.line, margin: '12px auto 0', flexShrink: 0,
        }} />
        {/* 헤더 */}
        {title && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 20px 10px', flexShrink: 0,
            borderBottom: `1px solid ${C.line}`,
          }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{title}</span>
            <button
              onClick={onClose}
              style={{
                background: 'none', border: 'none', color: C.sub,
                fontSize: 18, cursor: 'pointer',
                minWidth: 44, minHeight: 44,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >✕</button>
          </div>
        )}
        {/* 스크롤 콘텐츠 */}
        <div style={{
          flex: 1, overflowY: 'auto',
          WebkitOverflowScrolling: 'touch',
          overscrollBehavior: 'contain',
        }}>
          {children}
        </div>
      </div>
    </>
  )
}
