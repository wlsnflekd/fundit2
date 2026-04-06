// 테마 상수 및 useT hook
import { createContext, useContext, useState, useEffect } from 'react';

const themes = {
  light: {
    base: '#ffffff', // 배경
    s1: '#f8f9fa', // 표면1
    s2: '#ffffff', // 표면2
    s3: '#e9ecef', // 표면3
    line: '#ced4da', // 선
    gold: '#f0b840', // 골드 포인트
    blue: '#1d6fe8', // 블루
    green: '#0ea571', // 그린
    text: '#212529', // 텍스트
    sub: '#6c757d', // 서브 텍스트
    error: '#dc3545',
    success: '#28a745',
  },
  dark: {
    base: '#03060d', // 배경
    s1: '#070d1a', // 표면1
    s2: '#0b1224', // 표면2
    s3: '#101a30', // 표면3
    line: '#1c2b44', // 선
    gold: '#f0b840', // 골드 포인트
    blue: '#1d6fe8', // 블루
    green: '#0ea571', // 그린
    text: '#eaf0ff', // 텍스트
    sub: '#6b84a8', // 서브 텍스트
    error: '#dc3545',
    success: '#28a745',
  },
};

const ThemeContext = createContext();

// CSS 변수명 → themes 토큰 키 매핑
const CSS_VAR_KEYS = ['base', 's1', 's2', 's3', 'line', 'text', 'sub', 'gold'];

// html/body 배경색 + :root CSS 변수를 현재 테마에 맞게 즉시 동기화
// CSS 변수 업데이트가 없으면 PageLoadingFallback(var(--s1) 참조)이 항상 다크색으로 표시됨
function applyThemeToDOM(dark) {
  const t = themes[dark ? 'dark' : 'light'];
  const el = document.documentElement;
  el.style.background = t.base;
  el.style.color = t.text;
  document.body.style.background = t.base;
  document.body.style.color = t.text;
  CSS_VAR_KEYS.forEach(k => el.style.setProperty(`--${k}`, t[k]));
}

export const ThemeProvider = ({ children }) => {
  const [isDark, setIsDark] = useState(() => {
    try {
      const saved = localStorage.getItem('fundit-theme');
      return saved !== null ? saved === 'dark' : true; // 저장값 없으면 다크 기본
    } catch {
      return true;
    }
  });

  const theme = themes[isDark ? 'dark' : 'light'];

  // 테마 변경 시 DOM 배경 동기화
  useEffect(() => { applyThemeToDOM(isDark); }, [isDark]);

  const toggleTheme = () => {
    setIsDark(prev => {
      const next = !prev;
      try { localStorage.setItem('fundit-theme', next ? 'dark' : 'light'); } catch {}
      return next;
    });
  };

  return (
    <ThemeContext.Provider value={{ theme, isDark, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useT = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useT must be used within a ThemeProvider');
  }
  return context.theme;
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};