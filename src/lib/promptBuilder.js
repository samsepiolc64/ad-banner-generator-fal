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
- All key elements (headline, product, CTA) should have generous breathing room from the edges — do not push content against the canvas borders
- Static image, no animation
- CTA button visible and clearly readable
- No phone or OS interface elements
- No central QR codes`,
  meta: `-- Meta Ads --
- All key elements should have generous breathing room from every edge
- Text should occupy a modest portion of the composition — imagery dominates
- No Facebook or Instagram interface elements
- CTA button placed in the lower third of the composition`,
  'meta-stories': `-- Meta Ads | 9:16 (Stories/Reels) --
- NO CTA button in the image at all — none
- Keep the top band and bottom band of the image empty (they will be hidden by platform UI)
- Place the headline in the middle-upper portion, centered horizontally`,
  programmatic: `-- Programmatic --
- Content should have clear margin from every edge
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
    return {
      type: 'sides',
      instruction: `The final delivered banner will be cropped to a narrower width. Keep all key content — headline, product, CTA — concentrated in the horizontal center of the composition. Let the left and right extremes of the canvas extend the background uniformly, with no content, text, or product there.`,
    }
  } else {
    // canvas taller → crop top/bottom
    return {
      type: 'topbottom',
      instruction: `The final delivered banner will be cropped to a shorter height. Keep all key content — headline, product, CTA — concentrated in the vertical center of the composition. Let the top and bottom edges of the canvas extend the background uniformly, with no content, text, or CTA there.`,
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

  // Canvas crop zone for non-native AR (described without numbers to prevent leakage)
  let cropZone = ''
  if (modelInfo.needsResize) {
    const sz = computeSafeZone(format.width, format.height, modelInfo.ar)
    if (sz) {
      cropZone = `\nCOMPOSITION CONSTRAINT:
${sz.instruction}\n`
    }
  }

  // Build BRAND DNA section — uses deeper research fields if available
  const brandDna = `BRAND DNA — this is the client's actual brand. Do NOT generify. Every visual choice must feel like it belongs to THIS brand, not a generic ad:
- Brand name: ${brand.name}
- Website: ${brand.domain}${brand.industry ? `
- Industry: ${brand.industry}` : ''}${brand.productType ? `
- What they sell: ${brand.productType}` : ''}
- Primary color: ${brand.colors.primary} — dominant brand color, use prominently
- Secondary color: ${brand.colors.secondary}
- Accent color: ${brand.colors.accent} — for CTA button and highlights
- Visual identity: ${brand.visualStyle || brand.style || 'minimalist, premium feel'}${brand.visualMotifs ? `
- Recurring visual motifs from the site: ${brand.visualMotifs} — incorporate at least one` : ''}
- Photography character: ${brand.photoStyle || 'lifestyle photography, bright natural light'}
- Typography feel: ${brand.typography || 'modern geometric sans-serif, bold headlines'}${brand.tone ? `
- Tone of voice: ${brand.tone}` : ''}${brand.brandPersonality ? `
- Brand personality: ${brand.brandPersonality}` : ''}${brand.exampleTaglines?.length ? `
- Example brand headlines from site (match this voice): ${brand.exampleTaglines.map((t) => `"${t}"`).join(', ')}` : ''}
- Background preference for THIS variant: ${variantIndex === 1 ? 'dark' : 'light'}`

  const prompt = `OUTPUT FORMAT:
- A finished, production-ready advertising image
- Aspect ratio: ${format.ar}
- High resolution, sharp, print-quality
- Ad channel: ${format.channel === 'meta' ? 'Meta Ads' : format.channel === 'gdn' ? 'Google Display Ads' : 'Programmatic'}

⚠️ CRITICAL — THE IMAGE MUST LOOK LIKE A FINISHED PUBLISHED AD:
- Do NOT draw any measurement labels, size indicators, or numeric annotations anywhere in the image
- Do NOT draw arrows pointing to edges, dashed lines, dotted borders, or bracket outlines
- Do NOT render any text like "min.", "margin", "safe zone", "px", or any measurement values
- Do NOT include blueprint-style markup, technical specification diagrams, or mood-board annotations
- Do NOT render placeholder rectangles with labels inside
- The output must look like a real ad ready for publication — NEVER like a design spec sheet or style guide
- Zero tolerance for any technical markup, annotations, labels, or measurement indicators visible in the final image

${brandDna}

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
- All text must be crystal clear and highly legible at any display size
- Headline: substantial, bold, prominent — dominant text element in the composition
- High contrast between text and background for accessibility
- Font style: ${brand.typography || 'modern sans-serif'}

CHANNEL-SPECIFIC REQUIREMENTS:
${channelReqs}

NEGATIVE PROMPT (do NOT render any of these):
blurry, pixelated, low resolution, deformed text, illegible font, stretched image, distorted proportions, poor lighting, amateur quality, generic stock photo feel, multiple conflicting fonts, floating brand logo outside the product, standalone brand mark in corner, brand wordmark as graphic element outside product packaging, corner badge with brand name, emblem with brand name, medallion with brand name, seal with brand name, sticker with brand name outside product surface, brand watermark in background, brand watermark in corner, URL watermark, duplicate brand logo, brand name rendered as large decorative text, brand monogram as hero element, hallucinated logo, AI-generated logo floating in empty space, any numeric labels, any measurement text, "px" text, pixel values, "min." labels, "max." labels, "margin" text, "safe zone" text, dimension arrows, size arrows, size callouts, ruler overlays, ruler marks, corner brackets, registration marks, crop marks, dashed borders indicating zones, dotted rectangles, placeholder boxes with labels, technical diagram markup, blueprint annotations, spec sheet overlays, style guide annotations, mood board labels${isStories ? ', CTA button in image, buy now text, any text in top portion, any text in bottom portion' : ''}`

  return prompt
}

export { VARIANT_MATRIX }
