// Supabase Edge Function — 기업마당 API 프록시
// Vercel(AWS) IP 차단 우회: Deno Deploy 네트워크에서 bizinfo.go.kr 호출
// Deploy: supabase functions deploy bizinfo --project-ref ddivdcsierbngtuxtdyu
// Secret:  supabase secrets set BIZINFO_API_KEY=값 --project-ref ddivdcsierbngtuxtdyu

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const TAB_KEYWORDS: Record<string, string> = {
  '소진공': '소상공인시장진흥공단',
  '중진공': '중소벤처기업진흥공단',
  '소상공인': '소상공인',
  '중소기업': '중소기업진흥',
}

function jsonResponse(body: unknown, status = 200, extra: HeadersInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json', ...extra },
  })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }

  const apiKey = Deno.env.get('BIZINFO_API_KEY')
  if (!apiKey) {
    console.error('[bizinfo] BIZINFO_API_KEY secret not set')
    return jsonResponse({ error: 'BIZINFO_API_KEY not configured' }, 500)
  }

  const url = new URL(req.url)
  const tab       = url.searchParams.get('tab')      ?? '전체'
  const pageUnit  = parseInt(url.searchParams.get('pageUnit') ?? '20', 10)
  const pageIndex = parseInt(url.searchParams.get('page')     ?? '1',  10)

  let apiUrl = `https://www.bizinfo.go.kr/uss/rss/bizinfoApi.do`
             + `?crtfcKey=${apiKey}&dataType=json`
             + `&pageUnit=${pageUnit}&pageIndex=${pageIndex}`

  if (tab !== '전체' && TAB_KEYWORDS[tab]) {
    apiUrl += `&jrsdInsttNm=${encodeURIComponent(TAB_KEYWORDS[tab])}`
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 12000)

  try {
    const upstream = await fetch(apiUrl, {
      headers: { 'User-Agent': 'FUNDIT-CRM/1.0' },
      signal: controller.signal,
    })
    clearTimeout(timer)

    const rawText = await upstream.text()

    if (!upstream.ok) {
      console.error(`[bizinfo] Upstream HTTP ${upstream.status}: ${rawText.slice(0, 200)}`)
      return jsonResponse(
        { error: `Upstream error: ${upstream.status}`, detail: rawText.slice(0, 200) },
        502
      )
    }

    let data: unknown
    try {
      data = JSON.parse(rawText)
    } catch {
      console.error('[bizinfo] Non-JSON upstream response:', rawText.slice(0, 300))
      return jsonResponse(
        { error: 'Upstream returned non-JSON', detail: rawText.slice(0, 200) },
        502
      )
    }

    return jsonResponse(data, 200, {
      'Cache-Control': 's-maxage=300, stale-while-revalidate=600',
    })
  } catch (err) {
    clearTimeout(timer)
    const e = err as Error
    const isTimeout = e.name === 'AbortError'
    console.error('[bizinfo] Fetch error:', e.message)
    return jsonResponse(
      { error: isTimeout ? 'Upstream request timed out' : e.message },
      isTimeout ? 504 : 502
    )
  }
})
