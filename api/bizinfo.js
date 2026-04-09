// 기업마당 API 프록시 — Supabase Edge Function 경유
// bizinfo.go.kr이 Vercel(AWS) IP를 차단하므로 Deno Deploy 네트워크로 우회
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET')

  if (req.method === 'OPTIONS') {
    return res.status(204).end()
  }

  // VITE_ 접두어 변수(Vite 빌드 인라인용)와 일반 변수 모두 시도
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
                   || 'https://ddivdcsierbngtuxtdyu.supabase.co'
  const anonKey     = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY

  if (!anonKey) {
    console.error('[bizinfo] SUPABASE_ANON_KEY not configured (tried VITE_SUPABASE_ANON_KEY and SUPABASE_ANON_KEY)')
    return res.status(500).json({ error: 'SUPABASE_ANON_KEY not configured' })
  }

  const tab      = req.query.tab      || '전체'
  const pageUnit = req.query.pageUnit || '20'
  const page     = req.query.page     || '1'

  const edgeFnUrl = `${supabaseUrl}/functions/v1/bizinfo`
                  + `?tab=${encodeURIComponent(tab)}&pageUnit=${pageUnit}&page=${page}`

  try {
    const upstream = await fetch(edgeFnUrl, {
      headers: {
        'Authorization': `Bearer ${anonKey}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(15000),
    })

    const rawText = await upstream.text()

    if (!upstream.ok) {
      let detail = rawText.slice(0, 200)
      try { detail = JSON.parse(rawText).error || detail } catch { /* ignore */ }
      console.error(`[bizinfo] Edge function error ${upstream.status}: ${detail}`)
      return res.status(upstream.status).json({ error: detail })
    }

    let data
    try {
      data = JSON.parse(rawText)
    } catch {
      console.error('[bizinfo] Edge function non-JSON:', rawText.slice(0, 200))
      return res.status(502).json({ error: 'Edge function returned non-JSON' })
    }

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600')
    return res.json(data)
  } catch (err) {
    const isTimeout = err.name === 'TimeoutError' || err.name === 'AbortError'
    console.error('[bizinfo] Proxy error:', err.message)
    return res.status(isTimeout ? 504 : 502).json({
      error: isTimeout ? 'Edge function timed out' : err.message,
    })
  }
}
