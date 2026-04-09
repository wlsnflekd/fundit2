import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// 탭 → 기업마당 jrsdInsttNm 매핑 (api/bizinfo.js와 동일하게 유지)
const TAB_KEYWORDS = {
  '소진공': '소상공인시장진흥공단',
  '중진공': '중소벤처기업진흥공단',
  '소상공인': '소상공인',
  '중소기업': '중소기업진흥',
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const bizinfoKey = env.BIZINFO_API_KEY

  return {
  plugins: [react()],
  server: {
    host: 'localhost',
    hmr: {
      protocol: 'ws',
      host: 'localhost',
    },
    proxy: {
      // 로컬 개발 시 /api/bizinfo → bizinfo.go.kr 직접 프록시
      // (Vite dev 서버는 Vercel 서버리스 함수를 실행하지 않으므로)
      '/api/bizinfo': {
        target: 'https://www.bizinfo.go.kr',
        changeOrigin: true,
        secure: true,
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq, req) => {
            const url = new URL(req.url, 'http://localhost')
            const tab      = url.searchParams.get('tab')      || '전체'
            const pageUnit = url.searchParams.get('pageUnit') || '20'
            const page     = url.searchParams.get('page')     || '1'

            let path = `/uss/rss/bizinfoApi.do?crtfcKey=${bizinfoKey}&dataType=json&pageUnit=${pageUnit}&pageIndex=${page}`
            if (tab !== '전체' && TAB_KEYWORDS[tab]) {
              path += `&jrsdInsttNm=${encodeURIComponent(TAB_KEYWORDS[tab])}`
            }
            proxyReq.path = path
          })
        },
      },
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
  } // return 끝
}) // defineConfig 끝
