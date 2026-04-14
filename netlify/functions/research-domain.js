/**
 * Netlify Function: Domain research via Claude API.
 * Fetches the client's website and extracts brand data (colors, fonts, style, USP, logo).
 *
 * STATUS: Placeholder — requires ANTHROPIC_API_KEY.
 * When the key is available, this function will:
 * 1. Fetch the client's homepage HTML
 * 2. Send it to Claude with extraction instructions
 * 3. Return structured brand data
 *
 * For now, returns a 501 so the frontend falls back to manual brand input.
 */

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY

  if (!ANTHROPIC_API_KEY) {
    return new Response(
      JSON.stringify({
        error: 'ANTHROPIC_API_KEY not configured',
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

    // Step 1: Fetch the website HTML
    const url = domain.startsWith('http') ? domain : `https://${domain}`
    let html = ''
    try {
      const pageRes = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BannerGen/1.0)' },
      })
      html = await pageRes.text()
      // Trim to ~50k chars to fit in Claude context
      html = html.slice(0, 50000)
    } catch (fetchErr) {
      return new Response(
        JSON.stringify({ error: `Could not fetch ${url}: ${fetchErr.message}`, fallback: 'manual' }),
        { status: 422, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Step 2: Send to Claude for extraction
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
        messages: [
          {
            role: 'user',
            content: `Analyze this website HTML and extract brand data. Return ONLY valid JSON, no markdown.

HTML from ${domain}:
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
}`,
          },
        ],
      }),
    })

    if (!claudeRes.ok) {
      const errText = await claudeRes.text().catch(() => '')
      return new Response(
        JSON.stringify({ error: `Claude API error: ${claudeRes.status}`, fallback: 'manual' }),
        { status: 502, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const claudeData = await claudeRes.json()
    const text = claudeData.content?.[0]?.text || ''

    // Parse JSON from Claude's response
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return new Response(
        JSON.stringify({ error: 'Could not parse Claude response', fallback: 'manual' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const brandData = JSON.parse(jsonMatch[0])

    return new Response(
      JSON.stringify({ brand: { ...brandData, domain } }),
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
