import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: 'localhost',
    hmr: {
      protocol: 'ws',
      host: 'localhost',
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Vite 8 (rolldown) 에서는 manualChunks를 함수로 전달해야 함
        manualChunks(id) {
          // React 런타임 — 거의 변하지 않으므로 별도 chunk로 분리해 캐시 활용
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) {
            return 'vendor-react'
          }
          // Supabase SDK — 크기가 크고 독립적이므로 별도 chunk
          if (id.includes('node_modules/@supabase')) {
            return 'vendor-supabase'
          }
          // 어드민 전용 페이지: 일반 사용자는 진입 불필요 → 별도 청크
          if (
            id.includes('SAWorkspaces') ||
            id.includes('SAApprovals') ||
            id.includes('SASubscriptions') ||
            id.includes('SAStats') ||
            id.includes('Team') ||
            id.includes('Stats') ||
            id.includes('CustomerDistribution')
          ) {
            return 'pages-admin'
          }
          // CustomerDetailPanel은 Customers와 함께 묶음
          if (id.includes('CustomerDetailPanel') || id.includes('Customers')) {
            return 'pages-core'
          }
          // 대시보드 — 로그인 후 가장 먼저 방문하므로 별도 chunk로 preload 용이하게
          if (id.includes('Dashboard')) {
            return 'pages-core'
          }
        },
      },
    },
  },
})
