const CHANNEL_LABELS = {
  gdn: 'Google Display Network',
  meta: 'Meta Ads (Feed)',
  stories: 'Meta Ads (Stories)',
  programmatic: 'Programmatic Display',
  tiktok: 'TikTok Ads',
}

const CRITERIA = {
  gdn: [
    { id: 'text_coverage', name: 'Pokrycie tekstem < 20%' },
    { id: 'cta_visible', name: 'CTA czytelne' },
    { id: 'product_brand', name: 'Produkt/marka widoczna' },
    { id: 'text_legibility', name: 'Czytelność w małym formacie' },
    { id: 'composition', name: 'Czysta kompozycja' },
  ],
  meta: [
    { id: 'text_coverage', name: 'Balans tekst/obraz' },
    { id: 'cta_visible', name: 'CTA czytelne' },
    { id: 'product_brand', name: 'Produkt/marka widoczna' },
    { id: 'visual_hook', name: 'Siła wizualna' },
    { id: 'safe_edges', name: 'Bezpieczne krawędzie' },
  ],
  stories: [
    { id: 'safe_zone_top', name: 'Strefa górna czysta (14%)' },
    { id: 'safe_zone_bottom', name: 'Strefa dolna czysta (20%)' },
    { id: 'content_in_middle', name: 'Treść w strefie środkowej' },
    { id: 'no_ui_simulation', name: 'Brak symulacji UI' },
    { id: 'vertical_composition', name: 'Kompozycja pionowa 9:16' },
  ],
  programmatic: [
    { id: 'brand_visibility', name: 'Widoczność marki' },
    { id: 'cta_visible', name: 'CTA czytelne' },
    { id: 'composition', name: 'Czysta kompozycja' },
    { id: 'text_legibility', name: 'Czytelność' },
  ],
  tiktok: [
    { id: 'safe_zone_top', name: 'Strefa górna czysta' },
    { id: 'safe_zone_bottom', name: 'Strefa dolna czysta (35%)' },
    { id: 'content_in_middle', name: 'Treść w strefie środkowej' },
    { id: 'vertical_composition', name: 'Kompozycja pionowa' },
    { id: 'visual_energy', name: 'Energia wizualna' },
  ],
}

const CRITERIA_DESCRIPTIONS = {
  gdn: [
    { id: 'text_coverage', description: 'All text combined < 20% surface (Google hard limit)' },
    { id: 'cta_visible', description: 'CTA button clearly visible and readable' },
    { id: 'product_brand', description: 'Advertised product or service clearly identifiable' },
    { id: 'text_legibility', description: 'Text legible at 300×250 equivalent size' },
    { id: 'composition', description: 'Professional, uncluttered composition, clear visual hierarchy' },
  ],
  meta: [
    { id: 'text_coverage', description: "Text doesn't dominate; imagery is majority" },
    { id: 'cta_visible', description: 'CTA visible and compelling for feed placement' },
    { id: 'product_brand', description: 'Product/brand eye-catching and clear' },
    { id: 'visual_hook', description: 'Strong visual hook that stops scrolling in a busy feed' },
    { id: 'safe_edges', description: 'Key content not too close to edges (cropping risk)' },
  ],
  stories: [
    { id: 'safe_zone_top', description: 'Top 14% of height has NO text or key elements — Stories UI overlay zone' },
    { id: 'safe_zone_bottom', description: 'Bottom 20% is clear — CTA bar and swipe area' },
    { id: 'content_in_middle', description: 'All headline, CTA, key visuals in middle 66% of height' },
    { id: 'no_ui_simulation', description: 'No fake progress bars, profile avatars, swipe-up indicators' },
    { id: 'vertical_composition', description: 'Layout effectively uses vertical format for mobile' },
  ],
  programmatic: [
    { id: 'brand_visibility', description: 'Brand identity clearly recognizable' },
    { id: 'cta_visible', description: 'CTA clearly visible and actionable' },
    { id: 'composition', description: 'Clean, scalable design for various placements' },
    { id: 'text_legibility', description: 'Text readable at multiple display sizes' },
  ],
  tiktok: [
    { id: 'safe_zone_top', description: 'Top strip clear — TikTok UI overlay zone' },
    { id: 'safe_zone_bottom', description: 'Bottom 35% clear — TikTok CTA and buttons' },
    { id: 'content_in_middle', description: 'Key visuals and text in safe middle area' },
    { id: 'vertical_composition', description: 'Effective vertical TikTok format' },
    { id: 'visual_energy', description: 'Dynamic, engaging style suited for TikTok' },
  ],
}

function scoreFromFlags(flags) {
  if (!flags || flags.length === 0) return 50
  const sum = flags.reduce((acc, f) => {
    if (f.status === 'pass') return acc + 1.0
    if (f.status === 'warn') return acc + 0.5
    return acc // fail = 0
  }, 0)
  return Math.round((sum / flags.length) * 100)
}

function verdictFromScore(score) {
  if (score >= 80) return 'ready'
  if (score >= 60) return 'review'
  return 'rejected'
}

function fallbackFlags(criteriaKey) {
  return (CRITERIA[criteriaKey] || []).map((c) => ({
    id: c.id,
    name: c.name,
    status: 'warn',
    note: 'Ocena niedostępna — błąd analizy',
  }))
}

export const config = { path: '/.netlify/functions/evaluate-banner' }

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

  const { imageBase64, channel = 'gdn', isStories = false, width, height } = body

  if (!imageBase64) {
    return new Response(JSON.stringify({ error: 'imageBase64 is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Determine effective channel key (stories is a sub-variant of meta)
  const effectiveChannel = (channel === 'meta' && isStories) ? 'stories' : channel
  const criteriaKey = CRITERIA[effectiveChannel] ? effectiveChannel : 'gdn'
  const channelLabel = CHANNEL_LABELS[criteriaKey] || 'Display'
  const criteriaNames = CRITERIA[criteriaKey]
  const criteriaDescriptions = CRITERIA_DESCRIPTIONS[criteriaKey]

  const apiKey = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    // Graceful degradation: no key → fallback with score 50
    const flags = fallbackFlags(criteriaKey).map((f) => ({ ...f, note: 'Brak klucza API — ocena niedostępna' }))
    const score = 50
    return new Response(JSON.stringify({
      verdict: verdictFromScore(score),
      score,
      channel_label: channelLabel,
      flags,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }

  // Build the criteria list for the prompt
  const criteriaForPrompt = criteriaDescriptions.map((c) => ({
    id: c.id,
    description: c.description,
  }))

  const prompt = `You are a digital advertising quality reviewer. Evaluate this ad banner image against the channel-specific criteria below.

Channel: ${channelLabel}
Dimensions: ${width || '?'}x${height || '?'}px

For each criterion, respond with:
- "pass" — clearly meets the requirement
- "warn" — partially meets or borderline
- "fail" — clearly does not meet the requirement

Also write a short "note" (max 12 words in Polish) explaining your assessment.

Criteria to evaluate:
${JSON.stringify(criteriaForPrompt)}

Respond with ONLY a valid JSON array, no markdown:
[{"id":"...","status":"pass|warn|fail","note":"..."}]`

  let claudeFlags = null

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: 'image/jpeg',
                  data: imageBase64,
                },
              },
              {
                type: 'text',
                text: prompt,
              },
            ],
          },
        ],
      }),
      signal: AbortSignal.timeout(25000),
    })

    if (response.ok) {
      const data = await response.json()
      const rawText = data?.content?.[0]?.text?.trim() || ''
      // Extract JSON array from response (strip any accidental markdown fences)
      const jsonMatch = rawText.match(/\[[\s\S]*\]/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])
        if (Array.isArray(parsed)) {
          claudeFlags = parsed
        }
      }
    }
  } catch {
    // Timeout, network error, parse error — fall through to fallback
  }

  // Merge Claude output with criteria names; fill gaps with 'warn'
  let flags
  if (claudeFlags && claudeFlags.length > 0) {
    const byId = {}
    for (const f of claudeFlags) {
      byId[f.id] = f
    }
    flags = criteriaNames.map((c) => {
      const cf = byId[c.id]
      return {
        id: c.id,
        name: c.name,
        status: cf?.status && ['pass', 'warn', 'fail'].includes(cf.status) ? cf.status : 'warn',
        note: cf?.note || 'Brak oceny',
      }
    })
  } else {
    flags = fallbackFlags(criteriaKey)
  }

  const score = scoreFromFlags(flags)
  const verdict = verdictFromScore(score)

  return new Response(JSON.stringify({ verdict, score, channel_label: channelLabel, flags }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
