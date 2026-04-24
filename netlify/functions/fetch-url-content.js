/**
 * Netlify Function: fetch page content from a URL with bot-bypass fallbacks.
 * Used when a user pastes a subpage URL in the campaign notes field —
 * the content is included as context for Claude's prompt building.
 *
 * Fallback chain:
 *   1. Direct fetch with browser headers
 *   2. Jina.ai Reader (free, headless-backed, bypasses most bot protection)
 *   3. Wayback Machine (archived snapshot)
 */

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'pl-PL,pl;q=0.9,en;q=0.8',
  'Cache-Control': 'no-cache',
}

async function fetchDirect(url) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8000)
  try {
    const res = await fetch(url, { headers: BROWSER_HEADERS, redirect: 'follow', signal: controller.signal })
    if (!res.ok) return null
    const html = await res.text()
    if (html.length < 300) return null
    // Strip tags, collapse whitespace — Claude needs text not markup
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim()
    return text.length > 200 ? { text, source: 'direct' } : null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

async function fetchJina(url) {
  const jinaUrl = `https://r.jina.ai/${url}`
  try {
    const res = await fetch(jinaUrl, {
      headers: { 'Accept': 'text/plain', 'X-Return-Format': 'text', 'X-No-Cache': 'true' },
      signal: AbortSignal.timeout(12000),
    })
    if (!res.ok) return null
    const text = await res.text()
    return text.length > 300 ? { text, source: 'jina' } : null
  } catch {
    return null
  }
}

async function fetchWayback(url) {
  const clean = url.replace(/^https?:\/\//, '').replace(/\/$/, '')
  const waybackUrl = `https://web.archive.org/web/0/https://${clean}`
  try {
    const res = await fetch(waybackUrl, { headers: BROWSER_HEADERS, signal: AbortSignal.timeout(10000) })
    if (!res.ok) return null
    const html = await res.text()
    if (html.length < 500) return null
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim()
    return text.length > 200 ? { text, source: 'wayback' } : null
  } catch {
    return null
  }
}

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 })
  }

  let url, probe
  try {
    const body = await req.json()
    url = body.url
    probe = !!body.probe
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 })
  }

  if (!url || !/^https?:\/\//i.test(url)) {
    return new Response(JSON.stringify({ error: 'Invalid or missing URL' }), { status: 400 })
  }

  // Probe mode: HEAD request to detect Content-Type (image vs webpage)
  if (probe) {
    try {
      const res = await fetch(url, {
        method: 'HEAD',
        headers: BROWSER_HEADERS,
        signal: AbortSignal.timeout(5000),
        redirect: 'follow',
      })
      const ct = res.headers.get('content-type') || ''
      const type = ct.startsWith('image/') ? 'image' : 'page'
      return new Response(JSON.stringify({ type, contentType: ct }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      })
    } catch {
      return new Response(JSON.stringify({ type: 'page', contentType: '' }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      })
    }
  }

  // Try fallbacks in order
  const result = await fetchDirect(url)
    || await fetchJina(url)
    || await fetchWayback(url)
    || null

  if (!result) {
    return new Response(
      JSON.stringify({ error: 'Could not fetch URL — all methods failed', url }),
      { status: 502, headers: { 'Content-Type': 'application/json' } }
    )
  }

  return new Response(
    JSON.stringify({ content: result.text.slice(0, 5000), source: result.source, url }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  )
}

export const config = { path: '/.netlify/functions/fetch-url-content' }
