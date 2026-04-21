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
- Keep all key elements (headline, product, CTA) well within the canvas — generous breathing room from every edge, no content touching borders
- Static image, no animation, no implied interactivity
- CTA button clearly visible and readable
- No phone, browser, or OS interface elements
- No QR codes
- TEXT COVERAGE HARD LIMIT (Google policy): all text elements combined — headline, CTA, any body copy — must cover no more than one fifth of the total image surface; imagery and visuals must dominate`,
  meta: `-- Meta Ads (Feed) --
- SAFE ZONES: the top strip (roughly one seventh of image height) and the bottom strip (roughly one fifth of image height) must be free of all text, logos, and key visuals — Meta platform UI overlaps these areas on mobile
- All remaining key elements should have generous breathing room from every edge
- Keep text minimal — fewer words, larger type; imagery must dominate; ads with heavy text are penalized in delivery
- No Facebook, Instagram, or any social platform interface elements
- CTA button placed in the lower portion of the composition, clearly above the bottom safe zone`,
  'meta-stories': `-- Meta Ads | Stories / Reels (9:16) --
- NO CTA button anywhere in the image — none whatsoever
- SAFE ZONES (platform UI covers these — leave completely empty, no visuals, no text, no product):
  · Top strip: roughly the top seventh of the image height (platform header and profile info)
  · Bottom strip: roughly the bottom third of the image height (swipe-up UI, controls, and interactive elements)
  · Left and right narrow strips: a thin margin on each side
- Place ALL content — headline, visuals, product — in the central vertical portion of the image between the top and bottom safe zones
- Headline: centered horizontally, placed in the upper part of the central safe area
- Design for immediate impact — the message must be understood within one second`,
  programmatic: `-- Programmatic Display --
- Keep all content well within the canvas with clear margins from every edge — ads appear at many sizes and cropping must never cut content
- Legibility at small display sizes is the top priority: use large, bold text; avoid thin strokes, fine details, or small decorative elements that disappear when scaled down
- High contrast between all text and background is mandatory
- CTA button must be clearly visible and the action immediately obvious
- Avoid overly complex compositions — simple, bold visuals perform best across placements`,
  linkedin: `-- LinkedIn Ads --
- Professional, business-oriented visual tone — this is a B2B platform; avoid overly casual, playful, or consumer-lifestyle aesthetics
- SAFE ZONES: leave a thin margin on all four edges; LinkedIn feed UI overlaps side margins on mobile
- The message must be immediately clear to a professional scrolling their feed — lead with the value proposition
- Text is more acceptable on LinkedIn than on Meta — a concise headline + short descriptor is appropriate, but keep it clean and readable
- No personal social platform UI (no LinkedIn interface elements, no profile picture mocks, no connection count mockups)
- CTA button placed in the lower third, clearly readable, professional color
- Typography: clean, professional sans-serif; avoid decorative or script fonts
- Overall feel: credible, premium, business-ready`,
  tiktok: `-- TikTok Ads (Static Image) --
- SAFE ZONES — TikTok UI is very aggressive; these areas MUST be completely empty:
  · Bottom strip: roughly the bottom 35% of the image is covered by TikTok controls (like/comment/share buttons, sound icon, caption)
  · Top strip: roughly the top 10% of the image is covered by the top bar
  · Right strip: roughly the right 15% of the image is covered by action buttons column
- Place ALL content — headline, product, CTA — in the LEFT-CENTER area of the image, between the top and bottom safe zones, away from the right edge
- Visual style: bold, energetic, high-contrast, youth-oriented; design for immediate thumb-stopping impact
- Large, bold headline — designed to be read in under 1 second
- NO CTA button text in the image — TikTok overlays its own CTA
- Authentic, dynamic aesthetic — avoid overly polished "corporate" look; prefer vivid colors and energy
- Design for mobile-first, full-screen viewing`,
}

const GOAL_DIRECTIVES = {
  'Awareness (Świadomość marki)': `CAMPAIGN GOAL — BRAND AWARENESS:
- Primary mission: make the brand name and visual identity instantly memorable
- Prioritize striking, distinctive visuals over hard-sell messaging
- Emotional impact and brand recall matter more than direct conversion
- Hero: aspirational lifestyle, brand symbols, or beautiful brand imagery
- Tone: inspiring, aspirational, confident — the brand is the message
- CTA is secondary and subtle (e.g. "Poznaj nas", "Dowiedz się więcej")
- Design for maximum visual impact at a glance — someone sees this and remembers the brand`,

  'Consideration (Ruch / Zaangażowanie)': `CAMPAIGN GOAL — CONSIDERATION / TRAFFIC:
- Primary mission: spark genuine curiosity and pull the audience toward learning more
- Lead with a compelling benefit, feature, or offer that gives them a reason to click
- Balance aspirational brand visuals with a clear, informative message
- The viewer should feel: "this looks interesting — I want to know more"
- Tone: engaging, informative, inviting — approachable but not pushy
- CTA should invite exploration: "Sprawdź", "Dowiedz się więcej", "Zobacz ofertę", "Odkryj"
- Include enough information to spark interest but leave curiosity unresolved — the click completes the story`,

  'Conversion (Sprzedaż)': `CAMPAIGN GOAL — CONVERSION / SALES:
- Primary mission: drive immediate action — purchase, sign-up, lead form, phone call
- Create urgency and communicate clear, unambiguous value proposition
- Headline must directly address a pain point or lead with a specific benefit or offer
- CTA must be visually dominant, action-driven, and impossible to miss
- Tone: direct, confident, benefit-focused — no fluff, no vagueness
- If there is a discount, limited offer, or deadline — make it the visual hero
- Design optimized for conversion: clear hierarchy, product prominent, CTA impossible to ignore`,

  'Retargeting': `CAMPAIGN GOAL — RETARGETING:
- The viewer has ALREADY visited the site — they know the brand, they showed interest
- Primary mission: re-engage a warm audience and convert their existing intent
- Reference familiarity — speak to someone who almost made a decision
- Create urgency or gentle FOMO: limited time, limited stock, "still available for you"
- Tone: personal, direct, confident — like a friendly follow-up, not a cold pitch
- CTA: clear, direct re-engagement ("Wróć", "Dokończ zakup", "Oferta nadal czeka", "Ostatnia szansa")
- Remind them what they were interested in — product or benefit should be front and center`,
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
  format,           // { width, height, ar, channel }
  variantIndex,     // 0-based
  brand,            // { name, domain, colors: { primary, secondary, accent }, style, photoStyle, typography, audience, usp }
  headline,         // string
  cta,              // string
  compInsight,      // string or null
  notes,            // string or null
  modelInfo,        // { type, ar, needsResize } from resolveModel()
  campaignChannels, // string[] — selected channels from campaign form
}) {
  const variant = VARIANT_MATRIX[variantIndex % VARIANT_MATRIX.length]
  const hasGdn = (campaignChannels || []).some((c) => c.includes('Google'))
  const isStories = !hasGdn && format.channel === 'meta' && format.ar === '9:16'
  const isTikTokVertical = format.channel === 'tiktok' && format.ar === '9:16'

  let channelReqs = ''
  if (isStories) {
    channelReqs = CHANNEL_REQUIREMENTS['meta-stories']
  } else if (isTikTokVertical) {
    channelReqs = CHANNEL_REQUIREMENTS.tiktok
  } else if (hasGdn) {
    channelReqs = CHANNEL_REQUIREMENTS.gdn
  } else if (format.channel === 'meta') {
    channelReqs = CHANNEL_REQUIREMENTS.meta
  } else if (format.channel === 'linkedin') {
    channelReqs = CHANNEL_REQUIREMENTS.linkedin
  } else if (format.channel === 'tiktok') {
    channelReqs = CHANNEL_REQUIREMENTS.tiktok
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
- Brand name: ${brand.name}{{BRAND_NAME_SUPPRESS}}
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
- Ad channel: ${format.channel === 'meta' ? 'Meta Ads' : format.channel === 'gdn' ? 'Google Display Ads' : format.channel === 'linkedin' ? 'LinkedIn Ads' : format.channel === 'tiktok' ? 'TikTok Ads' : 'Programmatic'}

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
${GOAL_DIRECTIVES[brand.campaignGoal] || GOAL_DIRECTIVES['Conversion (Sprzedaż)']}

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
- Headline: "${headline}" — position: center, size: large, weight: bold${(isStories || isTikTokVertical) ? '' : `
- CTA button: "${cta}" — prominent button, rounded corners, accent color background, white text`}

TYPOGRAPHY REQUIREMENTS:
- All text must be crystal clear and highly legible at any display size
- Headline: substantial, bold, prominent — dominant text element in the composition
- High contrast between text and background for accessibility
- Font style: ${brand.typography || 'modern sans-serif'}
- Keep text concise and surrounded by visual breathing room — imagery should dominate the composition${format.channel === 'gdn' ? '\n- HARD LIMIT (Google policy): all text combined must cover no more than 20% of the total image surface area' : ''}

CHANNEL-SPECIFIC REQUIREMENTS:
${channelReqs}

NEGATIVE PROMPT (do NOT render any of these):
blurry, pixelated, low resolution, deformed text, illegible font, stretched image, distorted proportions, poor lighting, amateur quality, generic stock photo feel, multiple conflicting fonts, floating brand logo outside the product, standalone brand mark in corner, brand wordmark as graphic element outside product packaging, corner badge with brand name, emblem with brand name, medallion with brand name, seal with brand name, sticker with brand name outside product surface, brand watermark in background, brand watermark in corner, URL watermark, duplicate brand logo, brand name rendered as large decorative text, brand monogram as hero element, hallucinated logo, AI-generated logo floating in empty space, any numeric labels, any measurement text, "px" text, pixel values, percentage labels, "min." labels, "max." labels, "margin" text, "safe zone" text, "safe area" text, zone indicator overlays, percentage overlay text, composition percentage markers, dimension arrows, size arrows, size callouts, ruler overlays, ruler marks, corner brackets, registration marks, crop marks, dashed borders indicating zones, dotted rectangles, placeholder boxes with labels, technical diagram markup, blueprint annotations, spec sheet overlays, style guide annotations, mood board labels, white rectangle in corner, white box in corner, white card in corner, gray rectangle in corner, gray box in corner, light gray panel in corner, semi-transparent rectangle, frosted glass rectangle, rounded white box, empty white shape, empty rounded rectangle, logo placeholder shape, logo placeholder box, reserved area indicator, blank white area with distinct edges, white overlay box, white frame in corner${isStories ? ', CTA button, buy now button, shop now button, any interactive element, any text or visual element in the top strip of the image, any text or visual element in the bottom third of the image, any content near the left or right edges' : ''}${isTikTokVertical ? ', CTA button, buy now button, shop now button, any interactive element, any text or visual element in the top strip of the image, any text or visual element in the bottom 35% of the image, any content near the right edge of the image' : ''}`

  return prompt
}

export { VARIANT_MATRIX }
