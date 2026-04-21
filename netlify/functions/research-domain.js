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
 * Fetch a website screenshot and return as base64 data URL.
 * Uses Screenshotone API if SCREENSHOT_API_KEY env var is set,
 * falls back to Thum.io (free, no key required) otherwise.
 * Returns null if all attempts fail.
 */
async function fetchScreenshotAsDataUrl(domain) {
  const clean = domain.replace(/^https?:\/\//, '').replace(/\/$/, '')
  const targetUrl = `https://${clean}`

  // Helper: fetch a screenshot URL and return base64 data URL, or null on failure
  async function tryScreenshotUrl(label, screenshotUrl, timeoutMs) {
    try {
      console.log(`[screenshot] trying ${label} for ${targetUrl}`)
      const res = await fetchWithTimeout(screenshotUrl, timeoutMs)
      const ct = (res.headers.get('content-type') || '').split(';')[0].trim()
      console.log(`[screenshot] ${label} → HTTP ${res.status}, content-type: ${ct}`)
      if (!res.ok) { console.warn(`[screenshot] ${label} non-ok status`); return null }
      if (!ct.startsWith('image/')) { console.warn(`[screenshot] ${label} not an image`); return null }
      const buf = await res.arrayBuffer()
      console.log(`[screenshot] ${label} → ${buf.byteLength} bytes`)
      if (buf.byteLength < 5000) { console.warn(`[screenshot] ${label} too small`); return null }
      if (buf.byteLength > 4 * 1024 * 1024) { console.warn(`[screenshot] ${label} too large`); return null }
      const b64 = Buffer.from(buf).toString('base64')
      console.log(`[screenshot] ${label} success`)
      return `data:${ct};base64,${b64}`
    } catch (e) {
      console.warn(`[screenshot] ${label} exception:`, e.message)
      return null
    }
  }

  const apiKey = process.env.SCREENSHOT_API_KEY
  console.log(`[screenshot] SCREENSHOT_API_KEY set: ${!!apiKey}`)

  // 1. Try Screenshotone first (if API key configured)
  if (apiKey) {
    const params = new URLSearchParams({
      access_key: apiKey,
      url: targetUrl,
      format: 'jpg',
      image_quality: '75',
      viewport_width: '1280',
      viewport_height: '900',
      full_page: 'false',
      block_ads: 'true',
      block_cookie_banners: 'true',
      delay: '1',
    })
    const result = await tryScreenshotUrl('Screenshotone', `https://api.screenshotone.com/take?${params}`, 20000)
    if (result) return result
    console.warn('[screenshot] Screenshotone failed — falling back to Thum.io')
  }

  // 2. Fallback: Thum.io (free, no key required)
  return tryScreenshotUrl('Thum.io', `https://image.thum.io/get/width/1280/crop/900/${targetUrl}`, 15000)
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
    // CSS custom properties matching brand/primary/accent/cta patterns
    const cssColors = []
    const varRegex = /--(primary|brand|main|accent|secondary|cta|button|btn|color-primary|color-brand|color-accent|color-cta)(?:-color|-bg|-background|-default)?[^:;,\n]*\s*:\s*(#[0-9a-fA-F]{3,8})/gi
    let vc
    while ((vc = varRegex.exec(css)) !== null && cssColors.length < 8) {
      const varName = vc[0].split(':')[0].trim()
      cssColors.push(`${varName}: ${vc[2]}`)
    }
    if (cssColors.length > 0) {
      hints.push(`CSS brand color variables: ${cssColors.join('; ')}`)
    }

    // Button/CTA background colors from CSS rules
    const btnColors = []
    const btnRegex = /\.(?:btn|button|cta|btn-primary|btn-secondary|button-primary|button-cta|cta-button)[^{,]*\s*\{[^}]{0,400}background(?:-color)?\s*:\s*(#[0-9a-fA-F]{3,8})/gi
    let bc
    while ((bc = btnRegex.exec(css)) !== null && btnColors.length < 4) {
      btnColors.push(bc[1])
    }
    if (btnColors.length > 0) {
      hints.push(`CTA/button background colors from CSS: ${[...new Set(btnColors)].join(', ')}`)
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

async function fetchWithTimeout(url, timeoutMs = 8000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      headers: BROWSER_HEADERS,
      redirect: 'follow',
      signal: controller.signal,
    })
    return res
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Try URL variants IN PARALLEL — whichever succeeds first wins.
 * Max wall time: ~8s (not 60s like sequential). If all fail quickly,
 * we skip HTML fetch and let Claude infer from domain name alone.
 */
async function tryFetchVariants(domain) {
  const clean = domain.replace(/^https?:\/\//, '').replace(/\/$/, '')
  const variants = [
    `https://${clean}`,
    `https://www.${clean}`,
  ]

  try {
    return await Promise.any(
      variants.map(async (url) => {
        const res = await fetchWithTimeout(url, 8000)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const html = await res.text()
        return { html, finalUrl: res.url || url }
      })
    )
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
    const { domain, force } = body

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
    if (!force) {
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
    // Step 1: Try to fetch the website (multiple URL variants, timeout)
    const fetchResult = await tryFetchVariants(domain)
    const html = fetchResult?.html ? fetchResult.html.slice(0, 25000) : null

    // Step 1b: Pre-parse HTML for technical hints (fonts, colors, buttons)
    // These are passed to Claude as ground truth — much more reliable than visual inference
    const technicalHints = html ? extractTechnicalHints(html) : null

    // Step 1c: If HTML fetch failed, try a visual screenshot fallback
    let screenshotDataUrl = null
    if (!html) {
      screenshotDataUrl = await fetchScreenshotAsDataUrl(normalizedDomain)
    }

    // Step 2: Build the Claude prompt — with HTML if available, or just domain name
    const SCHEMA_INSTRUCTIONS = `Return ONLY valid minified JSON (no markdown fences, no explanation) matching EXACTLY this schema:
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
  "competitors": [
    { "name": "competitor brand name", "domain": "competitor.com", "positioning": "how they position themselves in 1 short sentence" }
  ],
  "competitorInsight": "1-2 sentences describing the competitive landscape — what competitors do VISUALLY and in MESSAGING (typical colors, typical imagery, typical taglines/copy approach). Be concrete — this informs how OUR ad should contrast.",
  "differentiationDirective": "1 sentence — the single clearest way THIS brand should visually/verbally stand out against that landscape. Actionable for creative direction."
}

IMPORTANT:
- Be SPECIFIC and CONCRETE. Avoid generic adjectives like "modern", "clean", "premium" unless paired with concrete visual evidence.
- Base every field on actual evidence from the site (or domain name if no HTML).
- If a field is truly unknowable, use a sensible inference, never leave empty.
- "ctaColor": if TECHNICAL HINTS are provided above, use the button color from there directly — it is ground truth extracted from CSS. Otherwise infer from the site's visual style.
- "headingFont" / "bodyFont": if TECHNICAL HINTS list Google Fonts, use those exact names. This is critical for brand-consistent ads.
- "colorUsagePattern": always describe which specific hex is used where — this directly drives ad creative decisions.
- "competitors": identify 3-5 real direct competitors in the SAME market (same country if local brand, same language if applicable). Use your training knowledge — DO NOT invent fake brands. If you don't know real ones, return an empty array [].
- "competitorInsight" and "differentiationDirective" should always be filled — they guide creative contrast even when competitor list is empty.`

    // Step 3: Build Claude messages — three modes:
    //   A) HTML available  → text prompt with full HTML + technical hints
    //   B) Screenshot only → multimodal prompt (image + text) via Claude Vision
    //   C) Nothing         → text-only inference from domain name
    let claudeMessages
    let screenshotUsed = false

    if (html) {
      // Mode A: full HTML analysis
      claudeMessages = [{
        role: 'user',
        content: `You are a senior brand strategist and front-end analyst. Extract deep brand DNA from this website for use in creating advertising creatives.

Website: ${domain}
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

      claudeMessages = [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mediaType, data: base64Data },
          },
          {
            type: 'text',
            text: `You are a senior brand strategist and visual designer. The HTML of this website was inaccessible (blocked by WAF/CDN), but here is a screenshot. Analyze the visual design carefully to extract brand DNA for advertising creatives.

Website: ${domain}

VISUAL ANALYSIS FOCUS:
- Identify ALL colors used — extract hex codes as precisely as possible from what you see
- Find CTA/action buttons (Buy, Order, Contact, Zamów, Sprawdź, etc.) and note their exact background color
- Identify font styles: serif vs sans-serif, weight, any recognizable typeface families
- Note the overall layout style, visual motifs, imagery, mood
- Read any visible headlines, taglines, product names
- Identify the brand name, industry, and what they sell

${SCHEMA_INSTRUCTIONS}`,
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
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 4096,
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

    // Parse JSON from Claude's response
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return new Response(
        JSON.stringify({ error: 'Could not parse Claude response', fallback: 'manual', raw: text.slice(0, 300) }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }

    let brandData
    try {
      brandData = JSON.parse(jsonMatch[0])
    } catch (parseErr) {
      return new Response(
        JSON.stringify({ error: 'Invalid JSON from Claude: ' + parseErr.message, fallback: 'manual' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
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
        source: 'fresh',
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
