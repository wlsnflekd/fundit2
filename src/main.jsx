import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// Service Worker 관리
// - DEV: 등록된 SW 전체 unregister (Vite dev server fetch 차단 방지)
// - PROD: 이 프로젝트는 SW를 사용하지 않으므로 unregister 유지
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(regs => {
    regs.forEach(reg => reg.unregister())
  })
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
