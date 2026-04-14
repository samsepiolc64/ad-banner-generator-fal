/**
 * Prompt builder — generates fal.ai prompts based on the skill's template.
 * This is the template-based version (no Claude API needed).
 * When Claude API is available, this can be enhanced with AI-generated prompts.
 */

const VARIANT_MATRIX = [
  {
    name: 'Produkt centralny',
    layout: 'Product centered, text below',
    hero: 'Product / mockup in center',
    bg: 'Light, clean, lots of white space',
    mood: 'Clean, premium, calm',
    headlineStyle: 'Calm, product-focused, elegant — describes product or effect',
  },
  {
    name: 'Lifestyle',
    layout: 'Lifestyle scene left 60% / text right 40%',
    hero: 'Person / user in context',
    bg: 'Dark or deep brand color',
    mood: 'Emotional, human, warm',
    headlineStyle: 'Emotional, human, aspirational — speaks to the person, not about the product',
  },
  {
    name: 'Typograficzny',
    layout: 'Typographic — text as main visual element',
    hero: 'Large headline as graphic',
    bg: 'Gradient or texture from brand palette',
    mood: 'Bold, modern, energetic',
    headlineStyle: 'Short, strong, striking — max 5 words, imperative or provocation',
  },
  {
    name: 'Asymetryczny minimalizm',
    layout: 'Asymmetric — product on side, lots of white space',
    hero: 'Product detail / close-up',
    bg: 'Neutral, architectural',
    mood: 'Minimalist, luxurious, calm',
    headlineStyle: 'Elegant, laconic, premium — sounds like a perfume or car tagline',
  },
  {
    name: 'Dynamiczny',
    layout: 'Dynamic — diagonal lines / movement',
    hero: 'Abstract + product',
    bg: 'Contrasting, two-tone',
    mood: 'Dynamic, technological, fast',
    headlineStyle: 'Energetic, active — action verb, sense of movement',
  },
]

const CHANNEL_REQUIREMENTS = {
  gdn: `-- Google Display Ads --
- Safe zone: all key elements min. 40px from each edge
- Static image, no animation
- CTA button visible and readable
- No phone/OS UI elements
- No central QR codes`,
  meta: `-- Meta Ads --
- Safe zone: min. 50px from each edge
- Text max 20% of image area
- No Facebook/Instagram UI
- CTA button in bottom third`,
  'meta-stories': `-- Meta Ads | 9:16 (Stories/Reels) --
- ABSOLUTE BAN on CTA in image
- SAFE ZONE: only y: 300px–1620px (1080×1320px centered)
- Dead zones: top 300px and bottom 300px — place nothing there
- Headline: y: 900–1300px`,
  programmatic: `-- Programmatic --
- Safe zone: min. 15px from edges
- Readability at small sizes is priority
- CTA button clear, action obvious`,
}

/**
 * Compute safe zone percentages for non-native AR formats (banner-in-canvas approach)
 */
function computeSafeZone(targetW, targetH, nativeAR) {
  const [nW, nH] = nativeAR.split(':').map(Number)
  const tR = targetW / targetH
  const nR = nW / nH

  if (Math.abs(tR - nR) < 0.01) return null // native, no crop needed

  if (nR > tR) {
    // canvas wider → crop sides
    const contentWidth = Math.round((tR / nR) * 100)
    const marginX = Math.round((100 - contentWidth) / 2)
    return {
      type: 'sides',
      contentPct: contentWidth,
      marginPct: marginX,
      instruction: `The actual ad content zone occupies the CENTER ${contentWidth}% of the canvas width (full height). The left ${marginX}% and right ${marginX}% will be discarded.
- Place ALL content strictly within the center ${contentWidth}% horizontal band
- Fill the outer ${marginX}% on each side with plain background color — no content, no text, no product there`,
    }
  } else {
    // canvas taller → crop top/bottom
    const contentHeight = Math.round((nR / tR) * 100)
    const marginY = Math.round((100 - contentHeight) / 2)
    return {
      type: 'topbottom',
      contentPct: contentHeight,
      marginPct: marginY,
      instruction: `The actual ad content zone occupies the FULL WIDTH × CENTER ${contentHeight}% of the canvas height. The top ${marginY}% and bottom ${marginY}% will be discarded.
- Place ALL content strictly within the center ${contentHeight}% vertical band
- Fill the top ${marginY}% and bottom ${marginY}% with plain background color — no content, no text, no CTA there`,
    }
  }
}

/**
 * Build a single prompt for a format + variant combination.
 */
export function buildPrompt({
  format,       // { width, height, ar, channel }
  variantIndex, // 0-based
  brand,        // { name, domain, colors: { primary, secondary, accent }, style, photoStyle, typography, audience, usp }
  headline,     // string
  cta,          // string
  compInsight,  // string or null
  notes,        // string or null
  modelInfo,    // { type, ar, needsResize } from resolveModel()
}) {
  const variant = VARIANT_MATRIX[variantIndex % VARIANT_MATRIX.length]
  const isStories = format.channel === 'meta' && format.ar === '9:16'

  let channelReqs = ''
  if (format.channel === 'meta' && isStories) {
    channelReqs = CHANNEL_REQUIREMENTS['meta-stories']
  } else if (format.channel === 'meta') {
    channelReqs = CHANNEL_REQUIREMENTS.meta
  } else if (format.channel === 'gdn') {
    channelReqs = CHANNEL_REQUIREMENTS.gdn
  } else {
    channelReqs = CHANNEL_REQUIREMENTS.programmatic
  }

  // Canvas crop zone for non-native AR
  let cropZone = ''
  if (modelInfo.needsResize) {
    const sz = computeSafeZone(format.width, format.height, modelInfo.ar)
    if (sz) {
      cropZone = `\nCANVAS CROP ZONE — CRITICAL:
This image is generated at ${modelInfo.ar} aspect ratio. The final delivered banner is ${format.width}×${format.height}px, which will be center-cropped from this canvas.
${sz.instruction}\n`
    }
  }

  const prompt = `TECHNICAL SPECS:
- Dimensions: ${format.width}x${format.height}px
- Aspect ratio: ${format.ar}
- Resolution: 2K
- Output format: PNG
- Ad channel: ${format.channel === 'meta' ? 'Meta Ads' : format.channel === 'gdn' ? 'Google Display Ads' : 'Programmatic'}
⚠️ RENDER AS FINAL AD ONLY — absolutely no dimension labels, no pixel measurements, no safe zone markers, no margin arrows, no crop marks, no registration marks, no ruler overlays, no px labels, no corner brackets, no technical diagram overlays, no blueprint-style annotations of any kind. Output must be a clean, print-ready advertising image with zero technical markup visible.

BRAND CONTEXT:
- Brand name: ${brand.name}
- Website: ${brand.domain}
- Primary color: ${brand.colors.primary} — use as dominant brand color
- Secondary color: ${brand.colors.secondary}
- Accent color: ${brand.colors.accent} — for CTA button and highlights
- Background preference: ${variantIndex === 1 ? 'dark' : 'light'}
- Typography style: ${brand.typography || 'modern geometric sans-serif, bold headlines, clean'}
- Visual style: ${brand.style || 'minimalist, premium feel'}
- Photography style: ${brand.photoStyle || 'lifestyle photography, bright natural light'}

LOGO HANDLING:
{{LOGO_BLOCK}}
${cropZone}
Campaign goal: ${brand.campaignGoal || 'Conversion'}
Key message: ${brand.usp || headline}
${brand.audience ? `Target audience: ${brand.audience}` : ''}
${compInsight ? `\nCOMPETITIVE CONTEXT:\n- Market landscape: ${compInsight}\n- Differentiation directive: CREATE CONTRAST with competitors — stand out, don't blend in.` : ''}
${notes ? `\nADDITIONAL CREATIVE NOTES (from client):\n${notes}` : ''}

CREATIVE DIRECTION — VARIANT ${variantIndex + 1} (${variant.name}):
- Layout: ${variant.layout}
- Hero element: ${variant.hero}
- Background: ${variant.bg}
- Mood/atmosphere: ${variant.mood}

AD COPY PLACEMENT:
- Headline: "${headline}" — position: center, size: large, weight: bold${isStories ? '' : `
- CTA button: "${cta}" — prominent button, rounded corners, accent color background, white text`}

TYPOGRAPHY REQUIREMENTS:
- All text must be crystal clear and highly legible
- Headline: minimum 36px equivalent, bold weight
- High contrast between text and background (WCAG AA minimum)
- Font style: ${brand.typography || 'modern sans-serif'}

CHANNEL-SPECIFIC REQUIREMENTS:
${channelReqs}

NEGATIVE PROMPT:
blurry, pixelated, low resolution, watermark, deformed text, illegible font, stretched image, distorted proportions, poor lighting, amateur quality, generic stock photo feel, multiple conflicting fonts, brand logo, logotype, wordmark, company name as graphic element, any logo or brand mark, hallucinated logo, AI-generated logo, dimension annotations, pixel measurements, safe zone markers, margin arrows, crop marks, registration marks, ruler overlays, px labels, corner brackets, technical diagram overlays, blueprint-style annotations${isStories ? ', CTA button in image, buy now text, any text in top 300px, any text in bottom 300px' : ''}`

  return prompt
}

export { VARIANT_MATRIX }
