/**
 * describe-materials — Netlify Function
 * Describes uploaded creative materials (product photos, banner refs, mood images)
 * in words so GPT Image 2 (text-to-image only) can use them as reference context.
 *
 * Input:  POST { items: [{ dataUrl: "data:image/jpeg;base64,...", category: "product"|"banner"|"mood" }] }
 * Output: { descriptions: [{ category, text }] }
 */

export const config = { path: '/.netlify/functions/describe-materials' }

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'

const PROMPTS = {
  product: `You are helping an AI image generator reproduce a specific product with pixel-perfect fidelity.

Analyze this product image and write a DENSE, PRECISE visual description (4-6 sentences in English) covering:
- Exact shape and form (proportions, silhouette, structure)
- All colors with approximate hex codes (e.g. "matte charcoal #2D2D2D body, rose gold #B76E79 metallic cap")
- Materials and textures (glass, matte plastic, metallic foil, frosted, glossy, etc.)
- Packaging details: label design style, typography presence on packaging, logo placement on the product itself
- Any distinctive design features (cap shape, embossing, patterns, special finishes)

Write ONLY the description. No preamble. Optimize for AI image generation prompting.`,

  banner: `You are extracting the visual DNA of an existing advertising banner so an AI can create a new ad in the same style.

Analyze this banner and write a focused style description (3-5 sentences in English) covering:
- Color palette with approximate hex codes for the 4-6 dominant colors
- Overall mood and atmosphere (3-5 precise adjectives)
- Compositional approach (foreground/background split, element placement, negative space use)
- Photography or illustration style (commercial lifestyle, editorial, product-on-white, etc.)
- Typography treatment (font character: serif/sans, weight, size relative to canvas — NOT the text content itself)
- Lighting and color grading style

Write ONLY the style description. No preamble.`,

  mood: `You are extracting the atmospheric qualities of an image to inspire the mood of an AI-generated ad.

Analyze this image and write a focused atmosphere description (2-4 sentences in English) covering:
- Lighting quality: direction (front/side/back), hardness (soft diffused vs. sharp direct), color temperature (warm golden vs. cool blue-white)
- Color palette and grading style (warm/cool, saturated/muted, high-contrast/flat)
- Emotional tone and mood (3-5 precise adjectives like "intimate, aspirational, energetic, serene")
- Scene context clue (interior/exterior, time of day) — briefly

Focus ONLY on mood, light, and atmosphere — not on the literal objects in the scene.
Write ONLY the description. No preamble.`,
}

async function describeOne(imageDataUrl, category, apiKey) {
  const [header, data] = imageDataUrl.split(',')
  const mediaType = header.match(/data:([^;]+)/)?.[1] || 'image/jpeg'

  const res = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5',
      max_tokens: 512,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data } },
            { type: 'text', text: PROMPTS[category] || PROMPTS.mood },
          ],
        },
      ],
    }),
    signal: AbortSignal.timeout(20000),
  })

  if (!res.ok) throw new Error(`Claude API error: HTTP ${res.status}`)
  const json = await res.json()
  return json?.content?.[0]?.text?.trim() || ''
}

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: { 'Content-Type': 'application/json' },
    })
  }

  let body
  try { body = await req.json() } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    })
  }

  const { items } = body
  if (!Array.isArray(items) || items.length === 0) {
    return new Response(JSON.stringify({ error: 'items array is required' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    })
  }

  const apiKey = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'CLAUDE_API_KEY not configured' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    })
  }

  // Describe all items in parallel
  const results = await Promise.all(
    items.map(async (item) => {
      try {
        const text = await describeOne(item.dataUrl, item.category, apiKey)
        return { category: item.category, text }
      } catch {
        return { category: item.category, text: '' }
      }
    })
  )

  return new Response(JSON.stringify({ descriptions: results.filter((r) => r.text) }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  })
}
