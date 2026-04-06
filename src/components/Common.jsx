// 공통 컴포넌트들
import React, { useState } from 'react';
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
