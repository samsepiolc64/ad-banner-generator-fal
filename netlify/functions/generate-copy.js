/**
 * Netlify Function: Generate ad copy (headlines + CTA) via Claude API.
 *
 * Takes brand research + campaign goal + channel + variant matrix
 * and returns N tailored headlines (one per creative variant) matched to:
 *   - brand tone and example taglines (voice fidelity)
 *   - campaign goal (Awareness / Conversion / Retargeting)
 *   - channel constraints (short for display banners, emotional for Meta, etc.)
 *   - variant creative direction (product-centered / lifestyle / typographic / ...)
 *   - competitor differentiation (avoid generic copy everyone else uses)
 */

const VARIANT_HINTS = [
  { name: 'Hero lifestyle',       headlineStyle: 'Emotional, human, warm — speaks to the person and their world, not about the product features' },
  { name: 'Product w scenie',     headlineStyle: 'Aspirational, sensory, product-forward — evokes the tactile/visual appeal of owning or using the product' },
  { name: 'Editorial split',      headlineStyle: 'Confident, editorial, punchy — reads like a magazine cover line; bold statement, no fluff' },
  { name: 'Immersive cinematic',  headlineStyle: 'Atmospheric, short, cinematic — few words, high impact; lets the image do most of the work' },
  { name: 'Minimalist éditorial', headlineStyle: 'Elegant, laconic, premium — quiet confidence; sounds like a luxury brand tagline' },
]

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
        error: 'CLAUDE_API_KEY not configured',
        fallback: true,
        message: 'Klucz Claude API nie jest skonfigurowany.',
      }),
      { status: 501, headers: { 'Content-Type': 'application/json' } }
    )
  }

  try {
    const { brand, goal, channels, variantCount, copyHints, language } = await req.json()

    if (!brand || !goal || !variantCount) {
      return new Response(
        JSON.stringify({ error: 'Missing brand / goal / variantCount' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Which variants to generate for
    const variants = []
    for (let i = 0; i < variantCount; i++) {
      variants.push({ index: i + 1, ...VARIANT_HINTS[i % VARIANT_HINTS.length] })
    }

    // Use explicit language from campaign settings; fall back to domain-based detection
    const langHint = language
      ? language
      : (brand.domain?.endsWith('.pl') || brand.exampleTaglines?.some((t) => /[ąćęłńóśźż]/i.test(t))
          ? 'Polish'
          : 'same language as the brand\'s website')

    const prompt = `You are a senior advertising copywriter. Write ad headlines for a real brand. Every headline must sound like THIS brand's voice — not generic ad copy.
${copyHints ? `
⚡ CLIENT COPY DIRECTION — HIGHEST PRIORITY ⚡
The client has provided specific guidance about the ad copy below.
This overrides all other creative considerations — follow it closely in EVERY headline.
Treat it as a direct brief from the client, not a suggestion.

${copyHints}

` : ''}

BRAND:
- Name: ${brand.name}
- Website: ${brand.domain}
- Industry: ${brand.industry || 'unknown'}
- What they sell: ${brand.productType || 'unknown'}
- Brand personality: ${brand.brandPersonality || 'unknown'}
- Tone of voice: ${brand.tone || 'unknown'}
- USP / differentiators: ${brand.usp || 'unknown'}
- Target audience: ${brand.audience || 'unknown'}
${brand.exampleTaglines?.length ? `- Example headlines from their own site (MATCH THIS VOICE — same rhythm, same word choice style, same level of formality):\n  ${brand.exampleTaglines.map((t) => `"${t}"`).join('\n  ')}` : ''}

COMPETITIVE CONTEXT:
${brand.competitorInsight ? `- Landscape: ${brand.competitorInsight}` : '- Landscape: unknown'}
${brand.differentiationDirective ? `- Differentiation directive: ${brand.differentiationDirective}` : ''}
→ Your headlines must NOT sound like generic competitor copy. Create contrast.

CAMPAIGN:
- Goal: ${goal}
- Channels: ${channels?.join(', ') || 'Display / Meta'}

LANGUAGE:
- Write all headlines in ${langHint}.

TASK:
Write exactly ${variantCount} DIFFERENT headlines — one per creative variant below. Each headline must match its variant's style AND fit the campaign goal.

VARIANTS:
${variants.map((v) => `${v.index}. "${v.name}" — headline style: ${v.headlineStyle}`).join('\n')}

GOAL-SPECIFIC GUIDANCE:
${goal.startsWith('Awareness') ? '- Focus on emotion, brand world, curiosity. NOT "buy now" energy. Build recognition.' : ''}
${goal.startsWith('Conversion') ? '- Direct, benefit-driven, action-oriented. Make the value obvious. Can include a clear promise.' : ''}
${goal === 'Retargeting' ? '- Tone of returning/continuing. Warm re-engagement, not desperate. Reference the unfinished journey subtly.' : ''}

ALSO write a short CTA button text (2-4 words, ${langHint}) that fits the goal and brand tone.

HARD RULES:
- Each headline MUST have exactly TWO PARTS separated by a literal newline (\n):
    LINE 1 — PRIMARY: 3–5 words. The dominant, striking statement. Works on its own.
    LINE 2 — SECONDARY: 5–10 words. A supporting benefit, detail, or emotional hook.
  Together they tell a complete mini-story. LINE 1 will be rendered large and bold;
  LINE 2 will be rendered smaller and lighter below it on the banner.
- NO emoji.
- NO brand name inside the headline unless it naturally fits (rare).
- NO generic ad clichés ("Discover more", "Unlock your potential", "Experience the difference") unless they genuinely match this brand's documented tone.
- Every headline must feel distinct — different angle, different rhythm, different word choice.
- If the brand's example taglines use "Ty/Twój" (you/your), match that. If they use imperative, match that.

OUTPUT:
Return ONLY valid minified JSON (no markdown, no explanation) matching this schema EXACTLY.
The "headline" value must contain a literal \n between the two parts:
{
  "headlines": [
    { "variantIndex": 1, "variantName": "Produkt centralny", "headline": "Krótka mocna linia\nDłuższa wspierająca linia z benefitem" },
    { "variantIndex": 2, "variantName": "Lifestyle", "headline": "Emocjonalna linia\nKonkretny benefit lub call-to-emotion" }
  ],
  "cta": "..."
}`

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 1536,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!claudeRes.ok) {
      const errText = await claudeRes.text().catch(() => '')
      return new Response(
        JSON.stringify({
          error: `Claude API error: HTTP ${claudeRes.status} — ${errText.slice(0, 200)}`,
          fallback: true,
        }),
        { status: 502, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const claudeData = await claudeRes.json()
    const text = claudeData.content?.[0]?.text || ''

    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return new Response(
        JSON.stringify({ error: 'Could not parse Claude response', fallback: true, raw: text.slice(0, 300) }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }

    let copyData
    try {
      copyData = JSON.parse(jsonMatch[0])
    } catch (parseErr) {
      return new Response(
        JSON.stringify({ error: 'Invalid JSON from Claude: ' + parseErr.message, fallback: true }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Sanity check — make sure we got the right count
    if (!Array.isArray(copyData.headlines) || copyData.headlines.length < variantCount) {
      return new Response(
        JSON.stringify({ error: `Got ${copyData.headlines?.length || 0} headlines, expected ${variantCount}`, fallback: true, copyData }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify(copyData),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message, fallback: true }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}

export const config = {
  path: '/.netlify/functions/generate-copy',
}
