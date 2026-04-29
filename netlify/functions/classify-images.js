/**
 * classify-images — Netlify Function
 * Classifies uploaded images as "product", "banner", or "mood" using Claude Haiku.
 * Accepts: POST { images: [{ dataUrl: "data:image/jpeg;base64,...", filename: "foto.jpg" }] }
 * Returns: { classifications: [{ filename, category: "product"|"banner"|"mood", confidence: "high"|"medium" }] }
 */

export const config = { path: '/.netlify/functions/classify-images' }

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'

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

  const { images } = body
  if (!Array.isArray(images) || images.length === 0) {
    return new Response(JSON.stringify({ error: 'images array is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Build multimodal content — one text + N images
  const imageBlocks = images.map((img, idx) => {
    const [header, data] = img.dataUrl.split(',')
    const mediaType = header.match(/data:([^;]+)/)?.[1] || 'image/jpeg'
    return {
      type: 'image',
      source: { type: 'base64', media_type: mediaType, data },
      // We label each image with its index for referencing in the prompt
    }
  })

  const filenameList = images.map((img, idx) => `Image ${idx + 1}: "${img.filename}"`).join('\n')

  const userContent = [
    ...imageBlocks,
    {
      type: 'text',
      text: `You are classifying advertising creative assets. I have provided ${images.length} image(s) above (in order: Image 1, Image 2, ...).

The images correspond to these filenames:
${filenameList}

For EACH image, classify it into exactly ONE of these three categories:
- "product" — a clear photograph of a specific product/item (packshot, cut-out, isolated object, product on white/plain background, or a clearly identifiable commercial product). The product itself is the main subject.
- "banner" — a finished advertising creative (has ad copy/text, CTA button, clearly composed for advertising, banner-like dimensions or ad layout). This is a ready-made ad, not raw material.
- "mood" — a lifestyle/atmospheric/stylistic photograph or illustration that is NOT primarily a product shot and NOT an ad creative. Used as inspiration for mood, atmosphere, color, or visual feel.

Also assign confidence:
- "high" — you are very certain about the category
- "medium" — there is some ambiguity

Respond with ONLY a valid JSON array, no markdown, no explanation:
[
  { "filename": "foto.jpg", "category": "product", "confidence": "high" },
  ...
]

Return exactly ${images.length} objects, one per image, in the same order as provided.`,
    },
  ]

  try {
    const res = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 1024,
        messages: [{ role: 'user', content: userContent }],
      }),
      signal: AbortSignal.timeout(25000),
    })

    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      return new Response(
        JSON.stringify({ error: `Claude API error: HTTP ${res.status}: ${errText.slice(0, 200)}` }),
        { status: 502, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const data = await res.json()
    const rawText = data?.content?.[0]?.text?.trim() || ''

    // Parse JSON from response — strip possible markdown fences
    let classifications
    try {
      const jsonText = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '')
      classifications = JSON.parse(jsonText)
    } catch {
      return new Response(
        JSON.stringify({ error: 'Failed to parse Claude response as JSON', raw: rawText.slice(0, 500) }),
        { status: 502, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Ensure we have a result for every image (fallback to mood if missing)
    const result = images.map((img, idx) => {
      const found = Array.isArray(classifications)
        ? classifications.find((c) => c.filename === img.filename) || classifications[idx]
        : null
      return {
        filename: img.filename,
        category: found?.category || 'mood',
        confidence: found?.confidence || 'medium',
      }
    })

    return new Response(JSON.stringify({ classifications: result }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      return new Response(JSON.stringify({ error: 'Timeout — Claude API did not respond in time' }), {
        status: 504,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    return new Response(JSON.stringify({ error: err.message || 'Unknown error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
