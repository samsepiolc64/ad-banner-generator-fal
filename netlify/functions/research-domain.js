/**
 * Netlify Function: Domain research via Claude API.
 * Tries to fetch the website; if that fails, still asks Claude
 * to infer the brand from the domain name alone.
 */

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'pl-PL,pl;q=0.9,en;q=0.8',
  'Accept-Encoding': 'gzip, deflate, br',
  'Cache-Control': 'no-cache',
  'Pragma': 'no-cache',
  'Upgrade-Insecure-Requests': '1',
}

async function fetchWithTimeout(url, timeoutMs = 15000) {
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

/** Try multiple URL variants — https, http, with/without www */
async function tryFetchVariants(domain) {
  const clean = domain.replace(/^https?:\/\//, '').replace(/\/$/, '')
  const variants = [
    `https://${clean}`,
    `https://www.${clean}`,
    `http://${clean}`,
    `http://www.${clean}`,
  ]

  for (const url of variants) {
    try {
      const res = await fetchWithTimeout(url)
      if (res.ok) {
        const html = await res.text()
        return { html, finalUrl: res.url || url }
      }
    } catch {
      // try next variant
    }
  }
  return null
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
    const { domain } = await req.json()

    if (!domain) {
      return new Response(
        JSON.stringify({ error: 'Missing domain' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Step 1: Try to fetch the website (multiple URL variants, timeout)
    const fetchResult = await tryFetchVariants(domain)
    const html = fetchResult?.html ? fetchResult.html.slice(0, 50000) : null

    // Step 2: Build the Claude prompt — with HTML if available, or just domain name
    const userContent = html
      ? `Analyze this website HTML and extract brand data. Return ONLY valid JSON, no markdown, no explanation.

Website: ${domain}

HTML:
${html}

Extract and return this JSON structure:
{
  "name": "Brand name",
  "colors": { "primary": "#hex", "secondary": "#hex", "accent": "#hex" },
  "style": "visual style description (3-5 words)",
  "photoStyle": "photography style",
  "typography": "font/typography description",
  "audience": "target audience",
  "usp": "key differentiators",
  "logoUrl": "absolute URL to logo or null"
}`
      : `I could not fetch the website ${domain}. Based on the domain name alone and your general knowledge, make your best inference about this brand. Return ONLY valid JSON, no markdown, no explanation.

If you don't recognize the domain, make reasonable assumptions from the domain name (e.g. ".pl" = Polish brand, industry hints from the name).

Return this JSON structure:
{
  "name": "Brand name inferred from domain",
  "colors": { "primary": "#hex", "secondary": "#hex", "accent": "#hex" },
  "style": "visual style description (3-5 words)",
  "photoStyle": "photography style",
  "typography": "font/typography description",
  "audience": "likely target audience",
  "usp": "likely key differentiators",
  "logoUrl": null
}`

    // Step 3: Send to Claude
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
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

    return new Response(
      JSON.stringify({
        brand: { ...brandData, domain },
        fetched: !!html,
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
