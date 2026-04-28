/**
 * Netlify Function: Domain research via Claude API + Supabase L2 cache.
 *
 * Flow:
 *   1. If ?force=true OR not in body: skip cache → always run fresh research
 *   2. Otherwise: SELECT from supabase brand_research WHERE domain = ?
 *      - Hit → return cached data (fast, ~50ms, zero Claude cost)
 *      - Miss → run Claude → UPSERT result into supabase
 *
 * Tries to fetch the client website; if that fails, still asks Claude
 * to infer the brand from the domain name alone.
 */

/**
 * Lazily create a Supabase client — null if env vars not set OR if the
 * package fails to load (bundling issue on Netlify). We use a dynamic
 * import so a broken install never crashes the whole function — at worst
 * we lose the L2 cache and fall back to running Claude every time.
 */
async function getSupabase() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) return null
  try {
    const mod = await import('@supabase/supabase-js')
    const createClient = mod.createClient || mod.default?.createClient
    if (!createClient) {
      console.warn('Supabase: createClient not found in module exports')
      return null
    }
    return createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  } catch (e) {
    console.warn('Supabase: failed to load @supabase/supabase-js —', e.message)
    return null
  }
}

/**
 * Derive a reasonable brand-name default from a domain.
 * "aleszale.pl" -> "Aleszale"; "x-kom.pl" -> "x-kom"; "www.foo.com" -> "Foo".
 * We keep the hyphen casing style intact when present (e.g. "x-kom"),
 * otherwise Title Case the single token.
 */
function brandNameFromDomain(domain) {
  if (!domain) return ''
  const clean = String(domain).toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '')
  const body = clean.split('.')[0] || clean
  if (!body) return ''
  // Preserve hyphenated brands as-is (x-kom, e-obuwie) but title-case single tokens
  if (body.includes('-')) return body
  return body.charAt(0).toUpperCase() + body.slice(1)
}

/**
 * Does the brand name plausibly come from this domain? Returns true if there's
 * significant lexical overlap between the domain body and the brand name
 * (ignoring case, diacritics, spaces). Used to flag hallucinated brand names
 * like "Ależ Żale" for domain "aleszale.pl".
 */
function brandMatchesDomain(brandName, domain) {
  if (!brandName || !domain) return false
  // Normalize: lowercase + strip diacritics. Crucially we DO NOT strip spaces,
  // so a hallucinated split like "Ales Zale" for "aleszale" is caught.
  const stripDiacritics = (s) => String(s).toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  const brand = stripDiacritics(brandName).trim()
  const body = stripDiacritics(
    String(domain).replace(/^https?:\/\//, '').replace(/^www\./, '').split('.')[0] || ''
  )
  if (!body || !brand || body.length < 3) return false
  // Domain body must appear as a contiguous substring in the brand name.
  // This accepts: "Aleszale", "aleszale.pl", "ALESZALE" → all contain "aleszale".
  // This rejects: "Ales Zale" (has space breaking the contiguous match) → override fires.
  return brand.includes(body)
}

/**
 * Extract the first complete JSON object from a text blob using brace-balance
 * scanning. More robust than `/{[\s\S]*}/` greedy regex because the text may
 * start with a prose block (e.g. VISUAL EVIDENCE) containing stray braces in
 * quoted strings. Returns the raw JSON string or null.
 */
function extractJsonObject(text) {
  if (!text) return null
  let pos = 0
  while (pos < text.length) {
    const start = text.indexOf('{', pos)
    if (start === -1) return null
    let depth = 0, inString = false, escape = false
    let end = -1
    for (let i = start; i < text.length; i++) {
      const c = text[i]
      if (escape) { escape = false; continue }
      if (c === '\\' && inString) { escape = true; continue }
      if (c === '"') { inString = !inString; continue }
      if (inString) continue
      if (c === '{') depth++
      else if (c === '}') {
        depth--
        if (depth === 0) { end = i; break }
      }
    }
    if (end === -1) return null // unclosed brace — give up
    const candidate = text.slice(start, end + 1)
    try { JSON.parse(candidate); return candidate } catch {}
    pos = start + 1 // not valid JSON — try next '{'
  }
  return null
}

/** Normalize a domain so the cache key is stable */
function normalizeDomain(domain) {
  return String(domain || '')
    .toLowerCase()
    .trim()
    .replace(/^https?:\/\//, '')
    .replace(/\/+$/, '')
}

/** Read from Supabase L2 cache; returns null if miss or error */
async function readSharedCache(supabase, normalizedDomain) {
  if (!supabase) return null
  try {
    const { data, error } = await supabase
      .from('brand_research')
      .select('brand_data, fetched, updated_at')
      .eq('domain', normalizedDomain)
      .maybeSingle()
    if (error) {
      console.warn('Supabase read error:', error.message)
      return null
    }
    return data || null
  } catch (e) {
    console.warn('Supabase read exception:', e.message)
    return null
  }
}

/** Upsert successful research into Supabase L2 cache; never throws */
async function writeSharedCache(supabase, normalizedDomain, brand, fetched) {
  if (!supabase) return
  try {
    const { error } = await supabase
      .from('brand_research')
      .upsert(
        {
          domain: normalizedDomain,
          brand_data: brand,
          fetched: !!fetched,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'domain' }
      )
    if (error) console.warn('Supabase write error:', error.message)
  } catch (e) {
    console.warn('Supabase write exception:', e.message)
  }
}

/**
 * Try to fetch an archived snapshot of a domain from the Wayback Machine.
 * Perfect fallback for Cloudflare-protected sites — Wayback has historical
 * snapshots of the REAL page (not the Cloudflare verification page).
 * Returns { html, archiveUrl, timestamp } or null.
 */
async function tryWaybackMachine(domain) {
  const clean = domain.replace(/^https?:\/\//, '').replace(/\/$/, '')
  // "/web/0/" redirects to the closest snapshot (usually most recent)
  const url = `https://web.archive.org/web/0/https://${clean}`
  try {
    console.log(`[wayback] fetching ${url}`)
    const res = await fetchWithTimeout(url, 8000)
    if (!res.ok) {
      console.warn(`[wayback] HTTP ${res.status}`)
      return null
    }
    const html = await res.text()
    if (html.length < 1000) {
      console.warn('[wayback] response too short — no real snapshot')
      return null
    }
    // Wayback's final URL pattern: /web/20240501120000/https://aleszale.pl/
    const finalUrl = res.url || url
    const timestampMatch = finalUrl.match(/\/web\/(\d{14})\//)
    const timestamp = timestampMatch?.[1] || null
    console.log(`[wayback] got ${html.length} chars, timestamp: ${timestamp}`)

    // Reject stale snapshots (>3 years old) — brand may have completely pivoted
    // and we shouldn't use ancient designs as ground truth.
    if (timestamp && timestamp.length >= 4) {
      const snapshotYear = parseInt(timestamp.slice(0, 4), 10)
      const currentYear = new Date().getFullYear()
      if (snapshotYear && currentYear - snapshotYear > 3) {
        console.warn(`[wayback] rejecting stale snapshot from ${snapshotYear} (>${currentYear - 3})`)
        return null
      }
    }
    return { html, archiveUrl: finalUrl, timestamp }
  } catch (e) {
    console.warn('[wayback] exception:', e.message)
    return null
  }
}

/**
 * Pre-parse HTML for technical brand hints to guide Claude:
 * Google Fonts names, CSS custom property colors, button/CTA background colors.
 * Returns a plain-text block or null if nothing useful found.
 */
function extractTechnicalHints(html) {
  if (!html) return null

  const hints = []

  // ---- 1. Google Fonts — exact family names ----
  const fontNames = new Set()
  const linkTagRegex = /<link[^>]+>/gi
  let lt
  while ((lt = linkTagRegex.exec(html)) !== null) {
    const tag = lt[0]
    if (!tag.includes('fonts.googleapis.com')) continue
    const hrefMatch = tag.match(/href=["']([^"']+)["']/i)
    if (!hrefMatch) continue
    const href = hrefMatch[1]
    // CSS2: multiple &family= params; CSS1: single family= with | separator
    const fpRegex = /[?&]family=([^&"'\s>]+)/gi
    let fp
    while ((fp = fpRegex.exec(href)) !== null) {
      // split by | or %7C for CSS1 multi-family
      const parts = fp[1].split(/\|%7C/i)
      for (const part of parts) {
        const name = part.split(':')[0].split('@')[0]
          .replace(/\+/g, ' ').replace(/%20/g, ' ').trim()
        if (name && name.length > 1) fontNames.add(name)
      }
    }
  }
  if (fontNames.size > 0) {
    hints.push(`Google Fonts in use: ${[...fontNames].join(', ')}`)
  }

  // ---- 2. Embedded CSS: brand color variables + button colors ----
  const styleChunks = []
  const styleRegex = /<style[^>]*>([\s\S]*?)<\/style>/gi
  let sm
  while ((sm = styleRegex.exec(html)) !== null) {
    styleChunks.push(sm[1])
  }
  const css = styleChunks.join('\n').slice(0, 60000)

  if (css) {
    // CSS custom properties — broad set of brand/UI color variables
    const cssColors = []
    const varRegex = /--(primary|brand|main|accent|secondary|cta|button|btn|background|bg|page-bg|surface|foreground|text|heading|color-primary|color-brand|color-accent|color-cta|color-bg|color-background|color-surface|color-foreground|color-text|color-heading)(?:-color|-bg|-background|-default|-primary|-secondary|-foreground|-on)?[^:;,\n]*\s*:\s*(#[0-9a-fA-F]{3,8})/gi
    let vc
    while ((vc = varRegex.exec(css)) !== null && cssColors.length < 12) {
      const varName = vc[0].split(':')[0].trim()
      cssColors.push(`${varName}: ${vc[2]}`)
    }
    if (cssColors.length > 0) {
      hints.push(`CSS color variables: ${cssColors.join('; ')}`)
    }

    // Colors defined in :root — extract ALL hex values (most comprehensive source)
    const rootColors = []
    const rootRegex = /:root\s*\{([^}]{0,5000})\}/g
    let rm
    while ((rm = rootRegex.exec(css)) !== null) {
      const rootBlock = rm[1]
      const propRegex = /--([a-z][a-z0-9-]*)\s*:\s*(#[0-9a-fA-F]{3,8})/gi
      let pm
      while ((pm = propRegex.exec(rootBlock)) !== null && rootColors.length < 15) {
        rootColors.push(`--${pm[1]}: ${pm[2]}`)
      }
    }
    if (rootColors.length > 0) {
      hints.push(`:root color tokens: ${rootColors.join('; ')}`)
    }

    // Button/CTA background colors from CSS class rules
    const btnColors = []
    const btnRegex = /\.(?:btn|button|cta|btn-primary|btn-secondary|button-primary|button-cta|cta-button)[^{,]*\s*\{[^}]{0,400}background(?:-color)?\s*:\s*(#[0-9a-fA-F]{3,8})/gi
    let bc
    while ((bc = btnRegex.exec(css)) !== null && btnColors.length < 4) {
      btnColors.push(bc[1])
    }
    if (btnColors.length > 0) {
      hints.push(`CTA/button background colors from CSS: ${[...new Set(btnColors)].join(', ')}`)
    }

    // Page/body background color
    const bodyBgRegex = /(?:^|\})\s*(?:html|body)\s*\{[^}]{0,400}background(?:-color)?\s*:\s*(#[0-9a-fA-F]{3,8})/gi
    let bb
    if ((bb = bodyBgRegex.exec(css)) !== null) {
      hints.push(`Body/page background color: ${bb[1]}`)
    }
  }

  return hints.length > 0 ? hints.join('\n') : null
}

/**
 * Extract the best logo URL from fetched HTML.
 * Priority: apple-touch-icon → SVG icon → largest PNG icon → skip
 */
function extractLogoFromHtml(html, baseUrl) {
  if (!html || !baseUrl) return null

  function resolve(href) {
    if (!href) return null
    href = href.trim()
    if (/^https?:\/\//.test(href)) return href
    if (href.startsWith('//')) return 'https:' + href
    try { return new URL(href, baseUrl).href } catch { return null }
  }

  // apple-touch-icon
  const atiMatches = html.match(/<link[^>]+>/gi) || []
  for (const tag of atiMatches) {
    if (/rel=["'][^"']*apple-touch-icon[^"']*["']/i.test(tag)) {
      const h = tag.match(/href=["']([^"']+)["']/i)
      if (h) return resolve(h[1])
    }
  }

  // SVG icon
  for (const tag of atiMatches) {
    if (/type=["']image\/svg\+xml["']/i.test(tag) && /rel=["'][^"']*icon[^"']*["']/i.test(tag)) {
      const h = tag.match(/href=["']([^"']+)["']/i)
      if (h) return resolve(h[1])
    }
  }

  // Largest PNG/icon by sizes attribute
  let bestHref = null, bestSize = 0
  for (const tag of atiMatches) {
    if (!/rel=["'][^"']*icon[^"']*["']/i.test(tag)) continue
    const sm = tag.match(/sizes=["'](\d+)x\d+["']/i)
    const hm = tag.match(/href=["']([^"']+)["']/i)
    if (sm && hm) {
      const sz = parseInt(sm[1], 10)
      if (sz >= 64 && sz > bestSize) { bestSize = sz; bestHref = hm[1] }
    }
  }
  if (bestHref) return resolve(bestHref)

  return null
}

/**
 * Fetch a logo URL server-side and convert to a base64 data URL.
 * Returns null if fetch fails, URL is unreachable, or file is too large.
 */
async function fetchLogoAsDataUrl(logoUrl) {
  if (!logoUrl) return null
  try {
    const res = await fetchWithTimeout(logoUrl, 5000)
    if (!res.ok) return null
    const buf = await res.arrayBuffer()
    if (buf.byteLength > 600 * 1024) return null // skip logos > 600 KB
    const ct = (res.headers.get('content-type') || 'image/png').split(';')[0].trim()
    const b64 = Buffer.from(buf).toString('base64')
    return `data:${ct};base64,${b64}`
  } catch {
    return null
  }
}

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'pl-PL,pl;q=0.9,en;q=0.8',
  'Accept-Encoding': 'gzip, deflate, br',
  'Cache-Control': 'no-cache',
  'Pragma': 'no-cache',
  'Upgrade-Insecure-Requests': '1',
}

async function fetchWithTimeout(url, timeoutMs = 8000, extraHeaders = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      headers: { ...BROWSER_HEADERS, ...extraHeaders },
      redirect: 'follow',
      signal: controller.signal,
    })
    return res
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Take a screenshot via Screenshotone API and return a base64 data URL.
 * Used as a visual fallback when live HTML fetch fails (e.g. Cloudflare sites).
 * Returns null if API key missing, request fails, or response is suspiciously small.
 */
async function tryScreenshotone(domain, apiKey) {
  const clean = domain.replace(/^https?:\/\//, '').replace(/\/$/, '')
  const params = new URLSearchParams({
    url: `https://${clean}`,
    access_key: apiKey,
    format: 'jpg',
    viewport_width: '1440',
    viewport_height: '900',
    block_ads: 'true',
    block_cookie_banners: 'true',
    // Don't wait for full JS render — just grab the initial paint (faster)
    delay: '2',
    timeout: '12',
  })
  const url = `https://api.screenshotone.com/take?${params}`
  try {
    console.log(`[screenshotone] fetching screenshot for ${clean}`)
    const res = await fetchWithTimeout(url, 15000)
    if (!res.ok) {
      console.warn(`[screenshotone] HTTP ${res.status}`)
      return null
    }
    const buf = await res.arrayBuffer()
    if (buf.byteLength < 10000) {
      console.warn(`[screenshotone] response too small (${buf.byteLength} bytes) — likely an error page`)
      return null
    }
    const b64 = Buffer.from(buf).toString('base64')
    console.log(`[screenshotone] got ${Math.round(buf.byteLength / 1024)} KB`)
    return `data:image/jpeg;base64,${b64}`
  } catch (e) {
    console.warn('[screenshotone] exception:', e.message)
    return null
  }
}

/**
 * Jina.ai Reader API — free, no key, headless-browser-backed, bypasses most
 * bot protection including Cloudflare. Returns clean markdown text of the page.
 * Docs: https://jina.ai/reader/
 */
async function tryJinaReader(domain) {
  const clean = domain.replace(/^https?:\/\//, '').replace(/\/$/, '')
  const url = `https://r.jina.ai/https://${clean}`
  try {
    console.log(`[jina] fetching ${url}`)
    const res = await fetch(url, {
      headers: {
        'Accept': 'text/plain',
        'X-Return-Format': 'text',
        'X-No-Cache': 'true',
      },
      signal: AbortSignal.timeout(12000),
    })
    if (!res.ok) { console.warn(`[jina] HTTP ${res.status}`); return null }
    const text = await res.text()
    if (text.length < 400) { console.warn('[jina] response too short'); return null }
    console.log(`[jina] got ${text.length} chars`)
    return text
  } catch (e) {
    console.warn('[jina] exception:', e.message)
    return null
  }
}

/**
 * Try URL variants IN PARALLEL — whichever succeeds first wins.
 * Three strategies:
 *   1. Direct fetch (https://domain + https://www.domain)
 *   2. Google referer trick — fakes a referral from Google search, bypasses
 *      bot-protection that only blocks direct access but allows search-referred traffic
 * Max wall time: ~8s. If all fail quickly, caller tries other fallbacks.
 */
async function tryFetchVariants(domain) {
  const clean = domain.replace(/^https?:\/\//, '').replace(/\/$/, '')
  const attempts = [
    { url: `https://${clean}`,       headers: {} },
    { url: `https://www.${clean}`,   headers: {} },
    // Google referer — bypasses some WAF/bot-detection that blocks direct traffic
    { url: `https://${clean}`,       headers: { Referer: `https://www.google.com/search?q=${encodeURIComponent(clean)}` } },
  ]

  try {
    return await Promise.any(
      attempts.map(async ({ url, headers }) => {
        const res = await fetchWithTimeout(url, 8000, headers)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const html = await res.text()
        return { html, finalUrl: res.url || url }
      })
    )
  } catch {
    return null
  }
}

/**
 * CDX raw snapshot fallback — queries Wayback Machine CDX API for the most
 * recent successful snapshot, then fetches the raw HTML (id_ flag = no toolbar
 * injection). More reliable than the /web/0/ redirect for some domains.
 * Returns { html, archiveUrl, timestamp } or null.
 */
async function tryCdxSnapshot(domain) {
  const clean = domain.replace(/^https?:\/\//, '').replace(/\/$/, '')
  try {
    console.log(`[cdx] querying CDX API for ${clean}`)
    // CDX API: get timestamp of the most recent HTTP 200 snapshot
    const cdxRes = await fetchWithTimeout(
      `https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(clean)}&output=json&limit=1&filter=statuscode:200&fl=timestamp&sort=reverse`,
      6000
    )
    if (!cdxRes.ok) { console.warn(`[cdx] CDX API HTTP ${cdxRes.status}`); return null }
    const rows = await cdxRes.json()
    // rows[0] is the header ["timestamp"], rows[1] is the first result
    if (!rows || rows.length < 2) { console.warn('[cdx] no snapshots found'); return null }
    const timestamp = rows[1][0]
    if (!timestamp || timestamp.length < 14) return null

    // Reject snapshots older than 3 years (brand may have completely changed)
    const snapshotYear = parseInt(timestamp.slice(0, 4), 10)
    const currentYear = new Date().getFullYear()
    if (snapshotYear && currentYear - snapshotYear > 3) {
      console.warn(`[cdx] rejecting stale snapshot from ${snapshotYear}`)
      return null
    }

    // id_ flag returns raw HTML without Wayback toolbar injection — cleaner for parsing
    const snapUrl = `https://web.archive.org/web/${timestamp}id_/https://${clean}`
    console.log(`[cdx] fetching raw snapshot ${timestamp} from ${snapUrl}`)
    const snapRes = await fetchWithTimeout(snapUrl, 10000)
    if (!snapRes.ok) { console.warn(`[cdx] snapshot HTTP ${snapRes.status}`); return null }
    const html = await snapRes.text()
    if (html.length < 1000) { console.warn('[cdx] snapshot too short'); return null }
    console.log(`[cdx] got ${html.length} chars, timestamp: ${timestamp}`)
    return { html, archiveUrl: snapUrl, timestamp }
  } catch (e) {
    console.warn('[cdx] exception:', e.message)
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

  const ANTHROPIC_API_KEY = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY

  if (!ANTHROPIC_API_KEY) {
    return new Response(
      JSON.stringify({
        error: 'CLAUDE_API_KEY (or ANTHROPIC_API_KEY) not configured',
        fallback: 'manual',
        message: 'Klucz Claude API nie jest skonfigurowany. Użyj ręcznego formularza marki.',
      }),
      { status: 501, headers: { 'Content-Type': 'application/json' } }
    )
  }

  try {
    const body = await req.json()
    const { domain, force, userScreenshot } = body

    if (!domain) {
      return new Response(
        JSON.stringify({ error: 'Missing domain' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const normalizedDomain = normalizeDomain(domain)
    const supabase = await getSupabase()

    // ---- L2 CACHE LOOKUP (Supabase) ----
    // Skip cache if user explicitly asked for fresh research (refresh button)
    // Also skip if user uploaded their own screenshot — that's a manual override
    if (!force && !userScreenshot) {
      const cached = await readSharedCache(supabase, normalizedDomain)
      if (cached) {
        return new Response(
          JSON.stringify({
            brand: { ...cached.brand_data, domain },
            fetched: cached.fetched,
            source: 'shared-cache',
            cachedAt: cached.updated_at,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      }
    }

    // ---- CACHE MISS (or forced refresh) → run actual research ----
    // source tracks WHAT data layer we used — reported back so UI can
    // show appropriate reliability warnings.
    let source = 'fresh'           // 'fresh' | 'screenshot' | 'wayback' | 'user-screenshot' | 'domain-only'
    let html = null
    let fetchResult = null
    let screenshotDataUrl = null
    let archiveInfo = null         // { archiveUrl, timestamp } when source === 'wayback'

    if (userScreenshot) {
      // Mode override: user uploaded their own screenshot → skip all fetches
      console.log('[flow] user-screenshot override — skipping fetches')
      screenshotDataUrl = userScreenshot
      source = 'user-screenshot'
    } else {
      // Step 1: Try to fetch the website (multiple URL variants, timeout)
      fetchResult = await tryFetchVariants(domain)
      html = fetchResult?.html ? fetchResult.html.slice(0, 15000) : null
      if (html) source = 'fresh'

      // Step 2: Jina.ai Reader — free, no key, bypasses most bot protection.
      // Returns clean page text even for JS-heavy and Cloudflare-protected sites.
      if (!html) {
        console.log('[flow] HTML failed — trying Jina.ai reader')
        const jinaText = await tryJinaReader(normalizedDomain).catch(() => null)
        if (jinaText) {
          html = jinaText.slice(0, 15000)
          source = 'jina'
          console.log('[flow] Jina.ai succeeded')
        }
      }

      // Step 3: If HTML fetch failed, try Screenshotone (visual fallback).
      // This catches Cloudflare-protected sites where direct fetch returns a WAF
      // challenge page. Screenshotone renders the real page in a headless browser.
      if (!html) {
        const ssKey = process.env.SCREENSHOTONE_API_KEY
        if (ssKey) {
          console.log('[flow] HTML failed — trying Screenshotone')
          const ssDataUrl = await tryScreenshotone(normalizedDomain, ssKey).catch(() => null)
          if (ssDataUrl) {
            screenshotDataUrl = ssDataUrl
            source = 'screenshot'
            console.log('[flow] Screenshotone succeeded')
          }
        } else {
          console.log('[flow] SCREENSHOTONE_API_KEY not set — skipping screenshot fallback')
        }
      }

      // Step 4a: CDX raw snapshot — queries Wayback CDX API for the exact latest
      // snapshot timestamp, then fetches raw HTML (no toolbar injection). More
      // reliable than the /web/0/ redirect and faster for many sites.
      if (!html && !screenshotDataUrl) {
        console.log('[flow] trying CDX snapshot')
        const cdxResult = await tryCdxSnapshot(normalizedDomain).catch(() => null)
        if (cdxResult) {
          html = cdxResult.html.slice(0, 15000)
          archiveInfo = { archiveUrl: cdxResult.archiveUrl, timestamp: cdxResult.timestamp }
          source = 'wayback'
          console.log('[flow] CDX snapshot succeeded')
        }
      }

      // Step 4b: If CDX also failed, try the Wayback Machine /web/0/ redirect.
      if (!html && !screenshotDataUrl) {
        console.log('[flow] trying Wayback Machine /web/0/ redirect')
        const waybackResult = await tryWaybackMachine(normalizedDomain).catch(() => null)
        if (waybackResult) {
          html = waybackResult.html.slice(0, 15000)
          archiveInfo = { archiveUrl: waybackResult.archiveUrl, timestamp: waybackResult.timestamp }
          source = 'wayback'
          console.log('[flow] using Wayback snapshot')
        }
      }

      if (!html && !screenshotDataUrl) source = 'domain-only'
    }

    // Pre-parse HTML for technical hints (fonts, colors, buttons)
    // These are passed to Claude as ground truth — much more reliable than visual inference
    const technicalHints = html ? extractTechnicalHints(html) : null

    // Step 2: Build the Claude prompt — with HTML if available, or just domain name
    const SCHEMA_INSTRUCTIONS = `Return a JSON object (no markdown fences) matching EXACTLY this schema — it may be preceded by a VISUAL EVIDENCE block when specified earlier in the prompt:
{
  "name": "official brand name",
  "industry": "specific industry vertical — e.g. 'premium menswear e-commerce', 'B2B logistics SaaS', 'sustainable skincare DTC', 'regional real estate agency'",
  "productType": "what they actually sell — be concrete (products, services, categories)",
  "colors": { "primary": "#hex", "secondary": "#hex", "accent": "#hex" },
  "visualStyle": "concrete visual identity in 1 sentence — e.g. 'warm earth tones with hand-drawn organic shapes on cream backgrounds' (NOT generic words like 'minimalist, premium')",
  "visualMotifs": "concrete recurring graphic elements seen on the site — shapes, patterns, icon styles, imagery types (e.g. 'isometric 3D illustrations, subtle grid backgrounds, circular product badges')",
  "photoStyle": "photography character — lighting, composition, subjects (e.g. 'soft daylight, overhead flat-lays of product with natural props')",
  "typography": "font characteristics — serif/sans, weight, feel (e.g. 'geometric sans-serif, thin weight for body, bold condensed for headlines')",
  "tone": "brand voice in 3-4 words — e.g. 'warm, direct, no-nonsense' or 'playful, irreverent, millennial'",
  "exampleTaglines": ["up to 3 actual headlines/taglines copied from the site — Polish if site is Polish"],
  "audience": "specific target audience with demographics + psychographics",
  "usp": "concrete differentiators — what makes this brand different from competitors",
  "brandPersonality": "3-5 adjectives describing brand personality — e.g. 'bold, trustworthy, innovative, warm'",
  "logoUrl": "absolute URL to logo image found on the site, or null",
  "ctaColor": "#hex — the exact background-color of the primary CTA button (e.g. 'Buy now', 'Kontakt', 'Sprawdź', 'Zamów'). If TECHNICAL HINTS list button colors, use the first one. Otherwise extract from inline CSS or make your best inference from visual context.",
  "headingFont": "exact font-family name for headings/titles (e.g. 'Montserrat', 'Playfair Display', 'Oswald'). If TECHNICAL HINTS list Google Fonts, pick the one most likely used for headings. Otherwise infer from visual analysis.",
  "bodyFont": "exact font-family name for body text (e.g. 'Inter', 'Open Sans', 'Lato'). If TECHNICAL HINTS list Google Fonts, pick the body font. Can be the same as headingFont.",
  "colorUsagePattern": "concrete description of how brand colors are used: which is the page background, which for headings/text, which for CTA buttons, which for section backgrounds (e.g. 'white page bg, #1A2B4C dark navy for headings and text, #FF6B00 orange for ALL CTA buttons, #F8F8F8 light gray for alternating section backgrounds')",
  "colorPalette": [
    { "hex": "#hex", "role": "where this color appears on the site — e.g. 'główne tło strony', 'kolor przycisków CTA', 'kolor nagłówków', 'tło sekcji hero', 'kolor akcentu / ikon', 'kolor tekstu body'" }
  ],
  "compositionStyle": "visual composition approach on the site — e.g. 'centrowany produkt na białym tle', 'asymetryczne layouty z dużą przestrzenią negatywną', 'diagonalne dynamiczne kompozycje', 'overhead flat-lay produkty z rekwizytami', 'pełnoekranowe hero images z nakładką tekstu'",
  "imageryType": "primary type of imagery used — e.g. 'studio product photography na białym tle', 'lifestyle photography z ludźmi w realnych sceneriach', 'abstrakcyjne ilustracje geometryczne', 'flat vector icon illustrations', 'zdjęcia produktowe + graficzne overlaye'",
  "lightingMood": "lighting/atmosphere character — e.g. 'jasne, przewiewne, high-key naturalne światło dzienne', 'ciemne, nastrojowe studio z rim lightingiem', 'ciepłe złote godziny', 'kliniczne białe tło produkt photography', 'dramatyczny wysoki kontrast noir'",
  "competitors": [
    { "name": "competitor brand name", "domain": "competitor.com", "positioning": "how they position themselves in 1 short sentence" }
  ],
  "competitorInsight": "1-2 sentences describing the competitive landscape — what competitors do VISUALLY and in MESSAGING (typical colors, typical imagery, typical taglines/copy approach). Be concrete — this informs how OUR ad should contrast.",
  "differentiationDirective": "1 sentence — the single clearest way THIS brand should visually/verbally stand out against that landscape. Actionable for creative direction."
}

LANGUAGE: All descriptive text fields (industry, productType, visualStyle, visualMotifs, photoStyle, typography, tone, audience, usp, brandPersonality, colorUsagePattern, colorPalette role descriptions, compositionStyle, imageryType, lightingMood, competitorInsight, differentiationDirective, competitor positioning) MUST be written in Polish. Font names, hex color codes, URLs, brand names, and exampleTaglines stay in their original form.

IMPORTANT:
- Be SPECIFIC and CONCRETE. Avoid generic adjectives like "modern", "clean", "premium" unless paired with concrete visual evidence.
- Base every field on actual evidence from the site (or domain name if no HTML).
- If a field is truly unknowable, use a sensible inference, never leave empty.
- "ctaColor": if TECHNICAL HINTS are provided above, use the button color from there directly — it is ground truth extracted from CSS. Otherwise infer from the site's visual style.
- "headingFont" / "bodyFont": if TECHNICAL HINTS list Google Fonts, use those exact names. This is critical for brand-consistent ads.
- "colorUsagePattern": always describe which specific hex is used where — this directly drives ad creative decisions.
- "colorPalette": identify 4–6 key colors used on the site — backgrounds, text colors, CTAs, section fills, accents. If TECHNICAL HINTS list CSS variables or :root tokens, extract those hex values with their roles. This is the MOST IMPORTANT field for ad visual fidelity — populate it carefully.
- "competitors": identify 3-5 real direct competitors in the SAME market (same country if local brand, same language if applicable). Use your training knowledge — DO NOT invent fake brands. If you don't know real ones, return an empty array [].
- "competitorInsight" and "differentiationDirective" should always be filled — they guide creative contrast even when competitor list is empty.`

    // Step 3: Build Claude messages — three modes:
    //   A) HTML available  → text prompt with full HTML + technical hints
    //   B) Screenshot only → multimodal prompt (image + text) via Claude Vision
    //   C) Nothing         → text-only inference from domain name
    let claudeMessages
    let screenshotUsed = false

    if (html) {
      // Mode A: full HTML analysis (either live fetch or Wayback snapshot)
      const waybackNote = source === 'wayback' && archiveInfo
        ? `\nNOTE: This HTML is an ARCHIVED snapshot from the Wayback Machine (archive.org), captured at ${archiveInfo.timestamp || 'unknown date'}. Some content may be outdated but the visual brand DNA (colors, fonts, layout) is typically stable.\n`
        : ''
      claudeMessages = [{
        role: 'user',
        content: `You are a senior brand strategist and front-end analyst. Extract deep brand DNA from this website for use in creating advertising creatives.

Website: ${domain}${waybackNote}
${technicalHints ? `
TECHNICAL HINTS PRE-EXTRACTED FROM HTML (treat these as ground truth — more reliable than visual inference):
${technicalHints}
` : ''}
HTML (truncated):
${html}

${SCHEMA_INSTRUCTIONS}`,
      }]
    } else if (screenshotDataUrl) {
      // Mode B: visual screenshot analysis via Claude Vision
      screenshotUsed = true
      const mediaTypeMatch = screenshotDataUrl.match(/^data:(image\/[^;]+);base64,/)
      const mediaType = mediaTypeMatch?.[1] || 'image/jpeg'
      const base64Data = screenshotDataUrl.replace(/^data:image\/[^;]+;base64,/, '')

      // Log image size to catch truncation / upload bugs
      const approxBytes = Math.floor(base64Data.length * 0.75)
      console.log(`[vision] source=${source} media=${mediaType} size=${approxBytes} bytes (~${Math.round(approxBytes/1024)} KB)`)

      const sourceNote = source === 'user-screenshot'
        ? 'The user MANUALLY UPLOADED this screenshot of their website because automated fetches failed. This is the AUTHORITATIVE view — trust it over any other signal.'
        : 'This screenshot was automatically captured via a headless browser (Screenshotone) because direct HTML fetch failed. This shows the REAL rendered page — trust it as the authoritative visual source.'

      claudeMessages = [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mediaType, data: base64Data },
          },
          {
            type: 'text',
            text: `You are a senior brand strategist and visual designer analyzing a screenshot to extract brand DNA for advertising creatives.

${sourceNote}

⚠ CRITICAL ANTI-HALLUCINATION RULES ⚠
1. BRAND NAME rule (strict): The brand name is almost always the domain body with a capital letter — for "${domain}" that means "${brandNameFromDomain(domain)}". Only override this if the LOGO in the screenshot clearly displays a DIFFERENT brand name (e.g. domain is "pzu.pl" but logo says "Powszechny Zakład Ubezpieczeń"). NEVER invent creative/phonetic interpretations of the domain (e.g. "aleszale" is NOT "Ależ Żale" — it's just "Aleszale").
2. PRODUCT/INDUSTRY rule: Industry and product type MUST come from what you SEE in the screenshot (product photos, category menu, hero content), NOT from how the domain sounds. Polish domain names are often folk-etymology traps (e.g. "aleszale.pl" has NOTHING to do with grief/complaints — look at the products shown).
3. EVIDENCE rule: Every descriptive field must be grounded in visible pixels. If you cannot see evidence for a field, write a minimal neutral value rather than guessing from the domain.
4. COLOR rule: Extract hex codes from what you see — dominant menu bar color, CTA button color, background color. Do NOT default to generic "corporate blue/orange" unless those colors are actually visible.

STEP 1 — GROUNDING (MANDATORY before you write JSON):
Before the JSON, write a brief "VISUAL EVIDENCE:" block listing concretely what you see in the image:
- Logo text/imagery (copy it exactly as shown)
- Main navigation/menu items (copy them exactly)
- Visible product names or categories (copy 3-5 examples)
- Dominant UI colors (describe them: "deep burgundy menu bar", "olive-green promo badge", etc.)
- CTA button colors and labels (e.g. "green WYPRZEDAŻ!!! badges")
- Hero image subject/mood
- Any headlines or slogans visible

STEP 2 — JSON:
After the VISUAL EVIDENCE block, output the JSON object. EVERY field in the JSON MUST be derived directly from your evidence:
- "name": use the EXACT logo text you described (e.g. if evidence says logo = "aleszale.pl", then name = "aleszale.pl" — DO NOT split words, DO NOT reinterpret).
- "colors.primary": the dominant menu/nav color you described (e.g. if evidence = "deep burgundy menu bar" → primary must be a burgundy hex like #8B2142, NOT #222222 or generic dark).
- "colors.accent" / "ctaColor": the CTA button color you described (e.g. if evidence = "green WYPRZEDAŻ badges" → accent must be a green hex, NOT orange or blue).
- "productType": list the PRODUCTS you saw (e.g. "chusty, kapelusze, skarpety, czapki" — NOT generic categories).
- "industry": derive from visible products, in Polish (e.g. "akcesoria odzieżowe e-commerce" — NOT inferred from domain).

If your JSON contradicts your evidence (e.g. evidence says burgundy + green, but JSON has blue + orange), YOU HAVE FAILED and the output will be rejected.

${SCHEMA_INSTRUCTIONS}

FINAL REMINDER: Copy the logo text VERBATIM into "name". Translate visible colors into hex codes matching those colors. The domain is a label, not a clue.`,
          },
        ],
      }]
    } else {
      // Mode C: domain-name inference only
      claudeMessages = [{
        role: 'user',
        content: `You are a senior brand strategist. I could not fetch the website ${domain}. Based on the domain name and your general knowledge, make your best inference about this brand.

Rules:
- ".pl" → Polish brand
- Look for industry hints in the name
- If you recognize the brand (major companies), use what you know
- Otherwise make reasonable inferences

${SCHEMA_INSTRUCTIONS}`,
      }]
    }

    // Step 4: Send to Claude
    // Always use Haiku — fits within Netlify's ~26s gateway limit (5-12s vs 30-60s for Sonnet).
    // Haiku is sufficient for brand extraction from HTML text and screenshot analysis.
    const model = 'claude-haiku-4-5'
    const maxTokens = 4096

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        messages: claudeMessages,
      }),
    })

    if (!claudeRes.ok) {
      const errText = await claudeRes.text().catch(() => '')
      return new Response(
        JSON.stringify({
          error: `Claude API error: HTTP ${claudeRes.status} — ${errText.slice(0, 200)}`,
          fallback: 'manual',
        }),
        { status: 502, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const claudeData = await claudeRes.json()
    const text = claudeData.content?.[0]?.text || ''

    // Parse JSON from Claude's response — balance-scan (not greedy regex)
    // because the text may include a VISUAL EVIDENCE block before the JSON,
    // and that block might contain stray braces in quoted strings.
    const jsonStr = extractJsonObject(text)
    if (!jsonStr) {
      return new Response(
        JSON.stringify({ error: 'Could not parse Claude response', fallback: 'manual', raw: text.slice(0, 300) }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Log the VISUAL EVIDENCE block (everything before the JSON) — priceless
    // for debugging hallucinations in screenshot mode
    const jsonStartIdx = text.indexOf(jsonStr)
    let evidence = ''
    if (jsonStartIdx > 0) {
      evidence = text.slice(0, jsonStartIdx).trim()
      if (evidence) console.log(`[vision] evidence block:\n${evidence.slice(0, 1500)}`)
    }

    // Also log the JSON Claude actually returned — so when evidence looks
    // good but the form is still wrong, we can see the exact mismatch.
    console.log(`[claude] json output:\n${jsonStr.slice(0, 2000)}`)

    let brandData
    try {
      brandData = JSON.parse(jsonStr)
    } catch (parseErr) {
      return new Response(
        JSON.stringify({ error: 'Invalid JSON from Claude: ' + parseErr.message, fallback: 'manual' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // ---- SANITY CHECK: brand name must resemble the domain ----
    // Catches hallucinations like "aleszale.pl" -> "Ależ Żale" (folk etymology).
    // If Claude's name has zero lexical overlap with the domain, override with
    // a domain-derived default. Logged so we can tell when this triggered.
    if (brandData.name && !brandMatchesDomain(brandData.name, domain)) {
      const fallbackName = brandNameFromDomain(domain)
      console.warn(`[sanity] brand name "${brandData.name}" does not match domain "${domain}" — overriding with "${fallbackName}"`)
      brandData.name = fallbackName
      brandData._nameOverridden = true
    }

    // ---- FETCH LOGO SERVER-SIDE (avoids CORS on client canvas) ----
    // 1. Try Claude's extracted logoUrl first
    // 2. Fall back to HTML icon parsing if Claude returned null
    let logoSourceUrl = brandData.logoUrl || null
    if (!logoSourceUrl && html && fetchResult?.finalUrl) {
      logoSourceUrl = extractLogoFromHtml(html, fetchResult.finalUrl)
      if (logoSourceUrl) brandData.logoUrl = logoSourceUrl
    }
    if (logoSourceUrl) {
      const logoDataUrl = await fetchLogoAsDataUrl(logoSourceUrl)
      if (logoDataUrl) {
        brandData.logoDataUrl = logoDataUrl
      }
    }

    // ---- WRITE TO L2 CACHE (best-effort, non-blocking failure) ----
    await writeSharedCache(supabase, normalizedDomain, brandData, !!html)

    return new Response(
      JSON.stringify({
        brand: { ...brandData, domain },
        fetched: !!html,
        screenshotUsed,
        source,
        archiveTimestamp: archiveInfo?.timestamp || null,
        archiveUrl: archiveInfo?.archiveUrl || null,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('research-domain fatal error:', err)
    return new Response(
      JSON.stringify({
        error: err.message || 'Unknown error',
        stack: err.stack?.split('\n').slice(0, 3).join(' | '),
        fallback: 'manual',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}

export const config = {
  path: '/.netlify/functions/research-domain',
}

// Named exports for unit testing — pure, side-effect-free functions only
export { brandNameFromDomain, brandMatchesDomain, extractJsonObject, extractTechnicalHints, normalizeDomain }
