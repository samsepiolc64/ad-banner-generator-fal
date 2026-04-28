/**
 * Netlify Function: server-side image proxy.
 *
 * Fetches a remote image URL server-side with:
 *  - Realistic browser headers (User-Agent, Accept, etc.)
 *  - Spoofed Referer: first tries the image's own domain (most permissive),
 *    then falls back to Google search Referer — bypasses IdoSell / Shopify /
 *    Symfony hotlink-protection that only allows same-origin or search-referred traffic.
 *  - CDX raw-snapshot fallback: if the direct URL fails (HTTP 403/410/503),
 *    attempts to retrieve the same URL from Wayback Machine CDX.
 *
 * Request:  POST { url: string }
 * Response: { dataUrl: "data:image/jpeg;base64,..." } or { error: "..." }
 */

const MAX_BYTES = 5 * 1024 * 1024 // 5 MB — fal.ai image_urls limit

const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
  'Accept-Language': 'pl-PL,pl;q=0.9,en;q=0.8',
  'Accept-Encoding': 'gzip, deflate, br',
  'Cache-Control': 'no-cache',
  'Sec-Fetch-Dest': 'image',
  'Sec-Fetch-Mode': 'no-cors',
  'Sec-Fetch-Site': 'cross-site',
}

/** Extract origin + domain from a URL, e.g. "https://sklep.pl/img/prod.jpg" → "https://sklep.pl" */
function originOf(url) {
  try {
    const u = new URL(url)
    return u.origin
  } catch {
    return null
  }
}

/** Fetch an image with a specific Referer, return Buffer or throw */
async function tryFetch(url, referer, timeoutMs = 8000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      headers: { ...BROWSER_HEADERS, Referer: referer },
      redirect: 'follow',
      signal: controller.signal,
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const ct = res.headers.get('content-type') || ''
    if (!ct.startsWith('image/') && !ct.startsWith('application/octet-stream')) {
      throw new Error(`Not an image: ${ct}`)
    }
    const buf = await res.arrayBuffer()
    if (buf.byteLength === 0) throw new Error('Empty response')
    if (buf.byteLength > MAX_BYTES) throw new Error(`Too large: ${Math.round(buf.byteLength / 1024)} KB (max 5 MB)`)
    return { buf, contentType: ct.split(';')[0].trim() }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * CDX fallback — if the direct URL fails (site blocking), try to retrieve the
 * most recent Wayback Machine snapshot of this exact URL.
 */
async function tryCdxImageFallback(url) {
  try {
    const encoded = encodeURIComponent(url)
    const cdxRes = await fetch(
      `https://web.archive.org/cdx/search/cdx?url=${encoded}&output=json&limit=1&filter=statuscode:200&fl=timestamp&sort=reverse`,
      { signal: AbortSignal.timeout(5000) }
    )
    if (!cdxRes.ok) return null
    const rows = await cdxRes.json()
    if (!rows || rows.length < 2) return null
    const timestamp = rows[1][0]
    if (!timestamp) return null

    const snapUrl = `https://web.archive.org/web/${timestamp}id_/${url}`
    const res = await fetch(snapUrl, {
      headers: BROWSER_HEADERS,
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) return null
    const ct = res.headers.get('content-type') || 'image/jpeg'
    const buf = await res.arrayBuffer()
    if (buf.byteLength === 0 || buf.byteLength > MAX_BYTES) return null
    return { buf, contentType: ct.split(';')[0].trim() }
  } catch {
    return null
  }
}

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  let body
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const { url } = body
  if (!url || typeof url !== 'string' || !url.startsWith('http')) {
    return new Response(JSON.stringify({ error: 'Missing or invalid url' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const origin = originOf(url)
  const googleReferer = `https://www.google.com/search?q=${encodeURIComponent(origin || url)}`

  // Strategy 1: same-origin Referer (most common hotlink-protection allowlist)
  // Strategy 2: Google Referer (bypass direct-access blocking)
  // Strategy 3: no Referer / generic (some servers only check presence)
  const referers = [
    origin,
    googleReferer,
    'https://www.google.com/',
  ].filter(Boolean)

  let result = null
  let lastError = 'All fetch attempts failed'

  for (const referer of referers) {
    try {
      console.log(`[proxy] trying ${url} with Referer: ${referer}`)
      result = await tryFetch(url, referer)
      console.log(`[proxy] success — ${result.buf.byteLength} bytes, type: ${result.contentType}`)
      break
    } catch (e) {
      console.warn(`[proxy] failed (Referer: ${referer}):`, e.message)
      lastError = e.message
    }
  }

  // CDX fallback — last resort for images blocked on the live site
  if (!result) {
    console.log('[proxy] trying CDX fallback for', url)
    result = await tryCdxImageFallback(url)
    if (result) {
      console.log(`[proxy] CDX success — ${result.buf.byteLength} bytes`)
    }
  }

  if (!result) {
    return new Response(
      JSON.stringify({ error: `Could not fetch image: ${lastError}` }),
      { status: 502, headers: { 'Content-Type': 'application/json' } }
    )
  }

  const b64 = Buffer.from(result.buf).toString('base64')
  // Sanitize content-type — only allow known image types
  const safeMime = /^image\/(jpeg|png|webp|gif|avif|svg\+xml|bmp)$/.test(result.contentType)
    ? result.contentType
    : 'image/jpeg'

  return new Response(
    JSON.stringify({ dataUrl: `data:${safeMime};base64,${b64}` }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  )
}

export const config = {
  path: '/.netlify/functions/fetch-image-proxy',
}
