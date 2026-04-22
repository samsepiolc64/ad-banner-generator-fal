/**
 * Netlify Function: Describe an existing banner image in detail via Claude Vision.
 *
 * Used by the "Zmień teksty" workflow: we analyze the already-generated banner,
 * extract a structured JSON description of every visual element (scene, subjects,
 * composition, lighting, palette, typography), strip out the text content, and
 * return it to the client. The client then substitutes the NEW text values into
 * the description and sends it as a regeneration prompt to Nano Banana Pro —
 * which renders Polish diacritics correctly (unlike FLUX Kontext).
 */

/**
 * Extract the first complete JSON object from a text blob using brace-balance
 * scanning — same helper pattern used in research-domain.js.
 */
function extractJsonObject(text) {
  if (!text) return null
  const start = text.indexOf('{')
  if (start === -1) return null
  let depth = 0, inString = false, escape = false
  for (let i = start; i < text.length; i++) {
    const c = text[i]
    if (escape) { escape = false; continue }
    if (c === '\\' && inString) { escape = true; continue }
    if (c === '"') { inString = !inString; continue }
    if (inString) continue
    if (c === '{') depth++
    else if (c === '}') {
      depth--
      if (depth === 0) return text.slice(start, i + 1)
    }
  }
  return null
}

const SCHEMA_INSTRUCTIONS = `Return a JSON object (no markdown fences) describing this advertising banner in enough detail that another AI model could recreate it almost identically. Follow this exact schema:

{
  "scene": "what the banner depicts overall — setting, context, situation (1-2 sentences)",
  "background": "the background — environment, room/outdoor setting, walls, floor, furniture visible in the background, windows, plants, decorative objects. Be specific about materials, colors, style.",
  "subjects": "the main subjects/people/products in focus — their appearance, clothing, poses, facial expressions, what they are doing, what they are holding. Include approximate ages of people, hair color/style, ethnicity if relevant. Be photorealistic and specific.",
  "foreground_objects": "items visible in the foreground — product, props, surfaces, objects on tables, accessories. Be specific about materials, colors, textures.",
  "composition": "how elements are arranged — left/right/center placement of subjects, camera angle, framing, focal point, depth of field, rule-of-thirds observations",
  "lighting": "light quality and direction — soft/hard, warm/cool, natural/artificial, key light position, shadows, overall mood",
  "color_palette": "dominant colors with approximate hex codes — e.g. 'warm beige #D4B896 for walls, muted olive green #7A8471 for clothing, warm oak #8B6F47 for furniture'. List 4-8 most dominant colors.",
  "atmosphere": "overall mood/feeling — 2-5 adjectives (e.g. 'cozy, domestic, intimate, warm, aspirational')",
  "photographic_style": "camera/lens/film character — e.g. 'commercial lifestyle photography, 35mm full-frame look, natural color grading, slight film grain'",
  "text_layout": {
    "headline_position": "where the primary headline text sits — e.g. 'bottom-left third, stacked over two lines'",
    "headline_style": "font character, size relative to canvas, color, weight, casing — NOT the text content. E.g. 'bold sans-serif, white, very large (~9% canvas height), all caps'",
    "secondary_position": "position of secondary/subline text, or null if none",
    "secondary_style": "style of secondary text, or null if none",
    "cta_position": "position of the CTA button/pill — e.g. 'bottom-right, horizontally aligned with headline baseline', or null if no CTA shown",
    "cta_style": "CTA visual style — button shape, background color, text color, padding. E.g. 'white pill button with dark text, rounded corners, ~7% canvas width'"
  },
  "logo_placement": "where the brand logo is placed (top-left, top-right, etc.) with its visual character — or null if no logo visible",
  "decorative_elements": "any graphic flourishes, patterns, gradients, shapes, overlays, vignettes — or null if none",
  "aspect_ratio": "estimated aspect ratio (e.g. '16:9', '1:1', '9:16')"
}

CRITICAL:
- Describe what you SEE, not assumptions. Be concrete and specific — another model will use this to rebuild the image.
- DO NOT include the actual text content of the headline, secondary line, or CTA in any field — only describe their STYLE and POSITION. The text will be provided separately when the image is regenerated.
- Fields must be in English (the prompt going to the image model will be in English).
- Every field must be filled — if something is truly not present, use null for that field.
- Be exhaustive — details you skip will be lost in regeneration.`

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
      JSON.stringify({ error: 'CLAUDE_API_KEY (or ANTHROPIC_API_KEY) not configured' }),
      { status: 501, headers: { 'Content-Type': 'application/json' } }
    )
  }

  try {
    const body = await req.json()
    const { imageBase64, mediaType } = body

    if (!imageBase64) {
      return new Response(
        JSON.stringify({ error: 'Missing imageBase64' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const cleanBase64 = imageBase64.replace(/^data:image\/[^;]+;base64,/, '')
    const resolvedMediaType = mediaType || 'image/jpeg'

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 3072,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: { type: 'base64', media_type: resolvedMediaType, data: cleanBase64 },
              },
              {
                type: 'text',
                text: `You are an expert advertising art director. Analyze this banner image and extract a complete structured description.\n\n${SCHEMA_INSTRUCTIONS}`,
              },
            ],
          },
        ],
      }),
    })

    if (!claudeRes.ok) {
      const errText = await claudeRes.text().catch(() => '')
      return new Response(
        JSON.stringify({ error: `Claude API error: HTTP ${claudeRes.status} — ${errText.slice(0, 200)}` }),
        { status: 502, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const claudeData = await claudeRes.json()
    const text = claudeData.content?.[0]?.text || ''
    const jsonStr = extractJsonObject(text)

    if (!jsonStr) {
      return new Response(
        JSON.stringify({ error: 'Could not parse Claude response', raw: text.slice(0, 300) }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }

    let description
    try {
      description = JSON.parse(jsonStr)
    } catch (parseErr) {
      return new Response(
        JSON.stringify({ error: 'Invalid JSON from Claude: ' + parseErr.message }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ description }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('describe-banner fatal error:', err)
    return new Response(
      JSON.stringify({ error: err.message || 'Unknown error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}

export const config = {
  path: '/.netlify/functions/describe-banner',
}
