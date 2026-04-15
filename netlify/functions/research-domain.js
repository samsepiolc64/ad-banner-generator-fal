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

import { createClient } from '@supabase/supabase-js'

/** Lazily create a Supabase client — null if env vars not set */
function getSupabase() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) return null
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
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
    const supabase = getSupabase()

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
- "competitors": identify 3-5 real direct competitors in the SAME market (same country if local brand, same language if applicable). Use your training knowledge — DO NOT invent fake brands. If you don't know real ones, return an empty array [].
- "competitorInsight" and "differentiationDirective" should always be filled — they guide creative contrast even when competitor list is empty.`

    const userContent = html
      ? `You are a senior brand strategist. Extract deep brand DNA from this website.

Website: ${domain}

HTML (truncated):
${html}

${SCHEMA_INSTRUCTIONS}`
      : `You are a senior brand strategist. I could not fetch the website ${domain}. Based on the domain name and your general knowledge, make your best inference about this brand.

Rules:
- ".pl" → Polish brand
- Look for industry hints in the name
- If you recognize the brand (major companies), use what you know
- Otherwise make reasonable inferences

${SCHEMA_INSTRUCTIONS}`

    // Step 3: Send to Claude (Sonnet for better extraction)
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
        messages: [{ role: 'user', content: userContent }],
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

    // ---- WRITE TO L2 CACHE (best-effort, non-blocking failure) ----
    await writeSharedCache(supabase, normalizedDomain, brandData, !!html)

    return new Response(
      JSON.stringify({
        brand: { ...brandData, domain },
        fetched: !!html,
        source: 'fresh',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message, fallback: 'manual' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}

export const config = {
  path: '/.netlify/functions/research-domain',
}
