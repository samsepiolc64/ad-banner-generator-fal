/**
 * Prompt builder for GPT Image 2 (fal-ai/gpt-image-2).
 *
 * Key differences vs. promptBuilder.js (Nano Banana):
 *  - Natural language — no technical spec lists
 *  - No separate negative_prompt field → forbidden elements described as positive constraints
 *  - No {{LOGO_BLOCK}} / {{BRAND_NAME_SUPPRESS}} placeholders — logo + brand name rules embedded inline
 *  - No aspect_ratio → width/height sent separately to fal.ai
 *  - GPT Image 2 renders Polish diacritics (ą, ę, ś, ć, ź, ż, ł, ó, ń) natively → explicit instruction
 */

const VARIANT_MATRIX = [
  {
    name: 'Hero lifestyle',
    direction:
      'Full-bleed lifestyle photograph as the visual hero — a person authentically using, wearing, or experiencing the product in a real-world setting. Headline and CTA float over a dark cinematic gradient in the lower portion of the image. Photography dominates at least 70% of the canvas.',
    mood:
      'Warm, cinematic, editorial — feels like a premium lifestyle magazine spread. Natural light, genuine emotion, real-life story.',
  },
  {
    name: 'Product w scenie',
    direction:
      'Product is the hero — carefully styled in a rich atmospheric environment with complementary props and tactile textures. Text appears on a contrasting area or side panel. Aspirational and curated — like a luxury brand\'s own editorial catalog or lookbook.',
    mood:
      'Aspirational, rich in texture and detail — like content from a premium brand\'s own Instagram feed.',
  },
  {
    name: 'Editorial split',
    direction:
      'Bold vertical split composition: left half features atmospheric lifestyle photography or a hero product shot; right half is a solid brand-color panel with the headline and CTA text. A hard geometric division creates modern editorial tension between the image and the color field.',
    mood:
      'Modern, magazine-editorial, confident — echoes high-end fashion and luxury brand campaigns.',
  },
  {
    name: 'Immersive cinematic',
    direction:
      'Full-bleed edge-to-edge scene with a wide cinematic composition. Minimal text floated over a naturally dark area of the image. Zero empty background — every pixel is photographic scene that tells a story without needing much text.',
    mood:
      'Cinematic, dramatic, high-impact — feels like a film still or a luxury car campaign. Atmosphere over information.',
  },
  {
    name: 'Minimalist éditorial',
    direction:
      'Generous negative space with one precisely placed visual element — a product detail shot or a single striking lifestyle accent. Clean, airy background (white or very light neutral with subtle texture). Typography is secondary to the single image element.',
    mood:
      'Quietly luxurious, calm, premium — like a high-end fragrance or jewellery advertisement. Restraint communicates exclusivity.',
  },
  {
    name: 'Typograficzny Bold',
    direction:
      'Brand color fills the entire canvas as a solid or near-solid color block. Oversized headline text dominates at least 50% of the visible canvas — the typography IS the hero. A single product shot or brand icon appears as a secondary anchor element only. No complex photography, no lifestyle scenes. Color-block approach — bold, uncompromising, unmissable at any size from 320×50 mobile banner to 970×250 billboard.',
    mood:
      'Bold, direct, and confident — like a protest poster or a luxury brand statement campaign. The message is impossible to ignore at any scale.',
  },
  {
    name: 'Gradient Premium',
    direction:
      'A rich gradient built from the brand\'s primary and secondary colors sweeps the entire canvas — not a flat color, not a photograph. A product or abstract brand element floats on this gradient field, clean and slightly luminous. Headline and CTA are placed in the most contrasting zone of the gradient. The gradient must feel warm, deep, and premium — NOT a generic web gradient.',
    mood:
      'Premium, modern, aspirational — like a luxury tech product launch or a high-end fragrance campaign. The gradient communicates quality without needing photography.',
  },
  {
    name: 'Social Proof',
    direction:
      'A large social proof element — an oversized rating, key statistic, or powerful one-liner — dominates the composition as the visual hero. Set in XXL bold type that immediately communicates trust and authority. Brand color background keeps it clean and focused. A supporting product shot or subtle element sits below or beside the stat without competing with it. The proof must be the undisputed focal point.',
    mood:
      'Trustworthy, authoritative, evidence-driven — like a financial results announcement or an award banner. Confidence comes from proven results, not aspirational aesthetics.',
  },
  {
    name: 'UGC / Authentic',
    direction:
      'Raw, organic, deliberately imperfect aesthetic — as if captured by a real customer or creator, not a studio photographer. A real-looking person in their everyday environment (kitchen, street, gym, living room) interacts naturally with the product. Natural light, genuine expression, slightly imperfect framing. Headline placed like a caption or organic text overlay — not a designed ad element. Intentionally avoids the polished "ad" look.',
    mood:
      'Authentic, energetic, relatable — stops the scroll because it looks like organic content, not advertising. Ideal for TikTok and Meta Stories. Feels like a trusted friend\'s recommendation.',
  },
]

const GOAL_DIRECTIVES = {
  'Awareness (Świadomość marki)':
    'CAMPAIGN GOAL — BRAND AWARENESS: Make the brand name and visual identity instantly memorable. Prioritize striking, distinctive visuals over hard-sell messaging. Emotional impact and brand recall matter more than direct conversion. The CTA should be subtle and secondary (e.g. "Poznaj nas", "Dowiedz się więcej"). Design for maximum visual impact at a glance.',

  'Consideration (Ruch / Zaangażowanie)':
    'CAMPAIGN GOAL — CONSIDERATION / TRAFFIC: Spark genuine curiosity and pull the audience toward learning more. Lead with a compelling benefit, feature, or offer that gives them a reason to click. The viewer should think: "this looks interesting — I want to know more." CTA should invite exploration: "Sprawdź", "Dowiedz się więcej", "Zobacz ofertę", "Odkryj".',

  'Conversion (Sprzedaż)':
    'CAMPAIGN GOAL — CONVERSION / SALES: Drive immediate action — purchase, sign-up, or lead. Create urgency and communicate a clear, direct value proposition. The CTA must be visually dominant and impossible to miss. If there is a discount or limited offer, make it the visual hero. Tone: direct, confident, benefit-focused.',

  Retargeting:
    'CAMPAIGN GOAL — RETARGETING: The viewer has already visited the site — they know the brand and showed interest. Re-engage them with urgency or gentle FOMO: limited time, limited stock, "still available for you." Speak personally and directly — like a friendly follow-up. CTA: "Wróć", "Dokończ zakup", "Oferta nadal czeka", "Ostatnia szansa".',
}

const CHANNEL_REQS = {
  gdn: `GOOGLE DISPLAY NETWORK: Keep all key elements (headline, product, CTA button) well within the canvas with generous breathing room from every edge. All text combined (headline, CTA, any body copy) must cover no more than 20% of the total image surface — imagery must dominate visually. Include a clearly visible, rounded CTA button. Do not include phone UI, browser chrome, QR codes, or any social platform interface elements.`,

  meta: `META ADS (FEED): Concentrate all content (headline, product, CTA) in the central portion of the image. Keep the very top and the very bottom of the image as pure background or scene only — platform UI covers these areas on mobile. Keep text minimal — fewer words, larger type — imagery must dominate. Place the CTA button in the lower-center area, well clear of the bottom edge. Do not include any social media interface elements.`,

  'meta-stories': `META STORIES / REELS (9:16 VERTICAL): Do NOT include a CTA button anywhere in the image. Concentrate all content (headline, product) in the middle third of the frame — keep the top portion and the large bottom third of the image as pure clean background or scene only, since platform controls cover these areas. Keep all content away from the left and right edges. Headline should be centered horizontally in the upper-center area of the content zone. Do not include any social media interface elements, app chrome, or platform UI of any kind.`,

  programmatic: `PROGRAMMATIC DISPLAY: Keep all content well within the canvas with generous breathing room from every edge. Prioritize legibility at small display sizes — use large, bold text and avoid fine details that disappear when scaled down. Ensure high contrast between text and background. Include a clearly visible CTA button. Keep the composition simple, bold, and immediately legible.`,

  linkedin: `LINKEDIN ADS: Professional, business-oriented visual tone — this is a B2B platform, so avoid overly casual or consumer-lifestyle aesthetics. Keep all content well away from every edge of the image. Lead with a clear value proposition for professionals. A concise headline plus short descriptor is appropriate. Include a CTA button in the lower third. Typography must be clean and professional. Overall feel: credible, premium, business-ready.`,

  tiktok: `TIKTOK ADS (9:16 VERTICAL): Concentrate ALL content (headline, product, visuals) strictly in the LEFT-CENTER area of the image — keep the large bottom portion, the very top, and the entire right side as clean background only, since TikTok's interface covers these areas. Do NOT include a CTA button — TikTok overlays its own. Visual style: bold, energetic, high-contrast, designed for immediate thumb-stopping impact. Large, bold headline readable in under 1 second.`,
}

/**
 * Build a single GPT Image 2 prompt for a format + variant combination.
 */
export function buildGptImage2Prompt({
  format,           // { width, height, ar, channel }
  variantIndex,     // 0-based
  brand,            // { name, domain, colors, style, photoStyle, typography, audience, usp, ... }
  headline,         // string — may contain \n to separate primary from secondary line
  cta,              // string
  hasProductImage,  // boolean
  compInsight,      // string or null
  notes,            // string or null
  campaignChannels, // string[]
}) {
  const variant = VARIANT_MATRIX[variantIndex % VARIANT_MATRIX.length]

  const hasGdn = (campaignChannels || []).some((c) => c.includes('Google'))
  const isStories = !hasGdn && format.channel === 'meta' && format.ar === '9:16'
  const isTikTokVertical = format.channel === 'tiktok' && format.ar === '9:16'

  let channelReqs
  if (isStories) {
    channelReqs = CHANNEL_REQS['meta-stories']
  } else if (isTikTokVertical) {
    channelReqs = CHANNEL_REQS.tiktok
  } else if (hasGdn) {
    channelReqs = CHANNEL_REQS.gdn
  } else if (format.channel === 'meta') {
    channelReqs = CHANNEL_REQS.meta
  } else if (format.channel === 'linkedin') {
    channelReqs = CHANNEL_REQS.linkedin
  } else if (format.channel === 'tiktok') {
    channelReqs = CHANNEL_REQS.tiktok
  } else {
    channelReqs = CHANNEL_REQS.programmatic
  }

  const channelLabel =
    format.channel === 'meta' ? 'Meta Ads'
    : format.channel === 'gdn' ? 'Google Display Ads'
    : format.channel === 'linkedin' ? 'LinkedIn Ads'
    : format.channel === 'tiktok' ? 'TikTok Ads'
    : 'Programmatic Display'

  // Typography
  const hasExactFonts = brand.headingFont || brand.bodyFont
  const typographyLine = hasExactFonts
    ? [
        brand.headingFont ? `"${brand.headingFont}" for headings` : null,
        brand.bodyFont && brand.bodyFont !== brand.headingFont ? `"${brand.bodyFont}" for body text` : null,
      ].filter(Boolean).join(', ')
    : (brand.typography || 'modern geometric sans-serif, bold headlines')

  // Parse headline: single line or two-part hierarchy
  const parts = headline.split('\n').map((s) => s.trim()).filter(Boolean)
  const primaryLine = parts[0] || headline
  const secondaryLine = parts[1] || null
  const ctaHex = brand.ctaColor || brand.colors?.accent || brand.colors?.primary || '#000000'

  // Build text block
  let textBlock
  if (isStories || isTikTokVertical) {
    // No CTA button for Stories / TikTok
    textBlock = secondaryLine
      ? `Render this text with crisp Polish typography including all diacritics (ą, ę, ś, ć, ź, ż, ł, ó, ń):\n- PRIMARY HEADLINE (large, bold, dominant): "${primaryLine}"\n- SECONDARY LINE directly below, noticeably smaller and lighter weight: "${secondaryLine}"\nBoth centered horizontally in the safe content zone. Font: ${typographyLine}.`
      : `Render this headline with crisp Polish typography including all diacritics:\n- HEADLINE (large, bold): "${primaryLine}"\nCentered horizontally in the safe content zone. Font: ${typographyLine}.`
  } else {
    textBlock = secondaryLine
      ? `Render this text with crisp Polish typography including all diacritics (ą, ę, ś, ć, ź, ż, ł, ó, ń):\n- PRIMARY HEADLINE (largest, heaviest, dominant — like 700–900 weight at ~80pt on a 1080px canvas): "${primaryLine}"\n- SECONDARY LINE directly below at 55–65% of the primary size, medium weight (400–500): "${secondaryLine}"\n- CTA BUTTON with text "${cta}" — prominently styled rounded button, background color ${ctaHex}, white text, clearly visible and immediately readable\nFont: ${typographyLine}. Use en dash (–) for any dashes — never em dash (—).`
      : `Render this text with crisp Polish typography including all diacritics (ą, ę, ś, ć, ź, ż, ł, ó, ń):\n- HEADLINE (large, bold): "${primaryLine}"\n- CTA BUTTON with text "${cta}" — prominently styled rounded button, background color ${ctaHex}, white text\nFont: ${typographyLine}. Use en dash (–) for any dashes — never em dash (—).`
  }

  // Build brand DNA
  const colorPaletteLines = brand.colorPalette?.length
    ? brand.colorPalette.map((c) => `  ${c.hex} → ${c.role}`)
    : []

  const brandCtx = [
    `Primary brand color: ${brand.colors?.primary || '#000000'} — use for dominant backgrounds, hero areas, and primary brand elements.`,
    `Secondary color: ${brand.colors?.secondary || '#ffffff'} — use for supporting sections and text areas.`,
    `Accent / CTA color: ${ctaHex} — use for the CTA button and highlight accents.`,
    brand.colorUsagePattern ? `Color usage pattern: ${brand.colorUsagePattern}.` : null,
    colorPaletteLines.length ? `Full color palette — use all of these, not just the primary:\n${colorPaletteLines.join('\n')}` : null,
    `⚡ COLOR MANDATE — NON-NEGOTIABLE: Only use the brand colors listed above. Any generic blue, default orange, or color not listed is a creative failure. Every background, gradient, and decorative element must come from this palette exclusively.`,
    `Typography: ${typographyLine}.`,
    brand.tone ? `Brand tone: ${brand.tone}.` : null,
    brand.brandPersonality ? `Brand personality: ${brand.brandPersonality}.` : null,
    `Visual style: ${brand.visualStyle || brand.style || 'minimalist, premium feel'}.`,
    brand.compositionStyle ? `Composition style: ${brand.compositionStyle}.` : null,
    brand.imageryType ? `Imagery type: ${brand.imageryType}.` : null,
    brand.lightingMood ? `Lighting/mood: ${brand.lightingMood}.` : null,
    brand.photoStyle ? `Photography direction: ${brand.photoStyle}.` : null,
    brand.visualMotifs ? `Brand visual motifs to incorporate: ${brand.visualMotifs}.` : null,
    brand.exampleTaglines?.length
      ? `Brand voice examples from the actual website — match this exact tone: ${brand.exampleTaglines.map((t) => `"${t}"`).join(', ')}.`
      : null,
    brand.industry ? `Industry: ${brand.industry}.` : null,
    brand.productType ? `What they sell: ${brand.productType}.` : null,
  ].filter(Boolean).join('\n')

  const prompt = `Create a production-ready ${channelLabel} advertising banner for ${brand.name}${brand.domain ? ` (${brand.domain})` : ''}.

IMAGE SIZE: ${format.width}×${format.height} pixels, aspect ratio ${format.ar}.

BRAND IDENTITY — this ad must look like it was made by ${brand.name}'s own design team. Someone who knows the brand's website must instantly recognize it. Every color, font, and visual choice must match this brand exactly — do not use generic ad aesthetics.
${brandCtx}

${GOAL_DIRECTIVES[brand.campaignGoal] || GOAL_DIRECTIVES['Conversion (Sprzedaż)']}

CREATIVE DIRECTION — Variant ${variantIndex + 1} (${variant.name}):
${variant.direction}
Atmosphere and mood: ${variant.mood}
${variant.name === 'Typograficzny Bold' ? `⚡ COLOR-CRITICAL: The ENTIRE canvas background MUST be exactly ${brand.colors?.primary}. No photography, no gradient — pure brand color block. All text in a high-contrast color that works against this background. CTA button in ${brand.ctaColor || brand.colors?.accent}.
` : ''}${variant.name === 'Gradient Premium' ? `⚡ COLOR-CRITICAL: Gradient MUST be built from ${brand.colors?.primary} → ${brand.colors?.secondary} ONLY — these two brand hex values are the only colors in the gradient. No photography. No other colors.
` : ''}${!hasProductImage ? `No specific product image was provided. Show a lifestyle scene or atmospheric visual that evokes the brand's world and product category (${brand.productType || brand.industry || 'this brand'}) — use a beautiful, representative, unlabeled prop or a scene that implies the product without showing a specific item.` : ''}${compInsight ? `\n\nCOMPETITIVE CONTEXT: ${compInsight} Create clear visual contrast with competitors — the ad must stand out, not blend in.` : ''}

KEY MESSAGE: ${brand.usp || primaryLine}
${brand.audience ? `TARGET AUDIENCE: ${brand.audience}` : ''}
${notes ? `ADDITIONAL CREATIVE NOTES: ${notes}\n⚠️ If these notes specify a headline or CTA text, treat them as OVERRIDES — use those values instead of the AD TEXT section above.` : ''}

VISUAL COMPOSITION REQUIREMENTS:
The image must be a finished, editorial-quality advertising image — not a generic digital banner. Photography or imagery must dominate at least 60% of the canvas. The composition must feel intentionally designed: every element has deliberate placement, visual tension, and breathing room. It must feel like a high-end magazine editorial or a premium brand campaign. Do not use a flat solid-color background with text floating in the middle, blank white or grey background with a product cutout, clip-art or stock-photo-generic style, corporate brochure grid layout, or gradient blob with copy.

${textBlock}

LOGO RULES:
Do not render the brand name "${brand.name}" as a standalone floating text element, wordmark, watermark, badge, seal, monogram, or decorative typographic element anywhere outside of product labels or packaging. The brand name may appear naturally on product packaging or labels as part of the product itself. Leave at least one corner (top-left preferred) naturally uncluttered — filled only with pure background color or texture, no objects, text, or design elements — so a real brand logo can be placed there later. This clean corner must look like a natural extension of the background, not a reserved placeholder box or empty geometric shape.

${channelReqs}

OUTPUT: Sharp, high-resolution, production-ready image that looks like a real published advertisement. Do not render any measurement labels, pixel values, margin indicators, percentage markers, crop marks, dashed zone borders, dimension arrows, or any technical annotations. The final image must be pure ad creative — never a design spec sheet, mood board, or style guide.`

  return prompt
}

export { VARIANT_MATRIX }
