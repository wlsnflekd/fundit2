// 기업마당 공지사항 API 프록시 — CORS 우회용
// Vercel serverless function: /api/bizinfo?tab=전체&page=1
export default async function handler(req, res) {
  // CORS 허용
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET')

  if (req.method === 'OPTIONS') {
    return res.status(204).end()
  }

  const apiKey = process.env.BIZINFO_API_KEY
  if (!apiKey) {
    console.error('[bizinfo] BIZINFO_API_KEY environment variable is not set')
    return res.status(500).json({ error: 'BIZINFO_API_KEY not configured' })
  }

  const pageIndex = parseInt(req.query.page || '1', 10)
  const pageUnit  = parseInt(req.query.pageUnit || '20', 10)
  const tab       = req.query.tab || '전체'

  // 탭별 기관명 키워드 → API jrsdInsttNm 필터
  const tabKeywords = {
    '소진공': '소상공인시장진흥공단',
    '중진공': '중소벤처기업진흥공단',
    '소상공인': '소상공인',
    '중소기업': '중소기업진흥',
  }

  // API URL 구성
  let apiUrl = `https://www.bizinfo.go.kr/uss/rss/bizinfoApi.do?crtfcKey=${apiKey}&dataType=json&pageUnit=${pageUnit}&pageIndex=${pageIndex}`

  if (tab !== '전체' && tabKeywords[tab]) {
    apiUrl += `&jrsdInsttNm=${encodeURIComponent(tabKeywords[tab])}`
  }

  try {
    const upstream = await fetch(apiUrl, {
      headers: { 'User-Agent': 'FUNDIT-CRM/1.0' },
      signal: AbortSignal.timeout(10000), // 10초 타임아웃
    })

    const rawText = await upstream.text()

    if (!upstream.ok) {
      console.error(`[bizinfo] Upstream HTTP ${upstream.status}: ${rawText.slice(0, 200)}`)
      return res.status(502).json({ error: `Upstream error: ${upstream.status}`, detail: rawText.slice(0, 200) })
    }

    // 응답이 JSON인지 확인
    let data
    try {
      data = JSON.parse(rawText)
    } catch {
      console.error('[bizinfo] Upstream returned non-JSON:', rawText.slice(0, 300))
      return res.status(502).json({ error: 'Upstream returned non-JSON response', detail: rawText.slice(0, 200) })
    }

    // 5분 캐싱 (Vercel Edge 캐시)
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600')
    return res.json(data)
  } catch (err) {
    const isTimeout = err.name === 'TimeoutError' || err.name === 'AbortError'
    console.error('[bizinfo] Fetch error:', err.message)
    return res.status(isTimeout ? 504 : 502).json({
      error: isTimeout ? 'Upstream request timed out' : err.message
    })
  }
}
