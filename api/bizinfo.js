// 기업마당 공지사항 API 프록시 — CORS 우회용
// Vercel serverless function: /api/bizinfo?tab=전체&page=1
export default async function handler(req, res) {
  // CORS 허용
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET')

  const apiKey = process.env.BIZINFO_API_KEY
  if (!apiKey) {
    return res.status(500).json({ error: 'BIZINFO_API_KEY not configured' })
  }

  const pageIndex = parseInt(req.query.page || '1', 10)
  const pageUnit = parseInt(req.query.pageUnit || '20', 10)
  const tab = req.query.tab || '전체'

  // 탭별 기관명 키워드 → API jrsdInsttNm 필터
  const tabKeywords = {
    '소진공': '소상공인시장진흥공단',
    '중진공': '중소벤처기업진흥공단',
    '소상공인': '소상공인',
    '중소기업': '중소기업진흥',
  }

  // API URL 구성
  let apiUrl = `https://www.bizinfo.go.kr/uss/rss/bizinfoApi.do?crtfcKey=${apiKey}&dataType=json&pageUnit=${pageUnit}&pageIndex=${pageIndex}`

  // 탭 필터 적용 (API 파라미터가 지원하는 경우)
  if (tab !== '전체' && tabKeywords[tab]) {
    apiUrl += `&jrsdInsttNm=${encodeURIComponent(tabKeywords[tab])}`
  }

  try {
    const upstream = await fetch(apiUrl, {
      headers: { 'User-Agent': 'FUNDIT-CRM/1.0' },
    })
    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: `Upstream error: ${upstream.status}` })
    }
    const data = await upstream.json()

    // 5분 캐싱 (Vercel Edge 캐시)
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600')
    return res.json(data)
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
