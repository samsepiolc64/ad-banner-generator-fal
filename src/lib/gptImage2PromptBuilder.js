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
  {
    name: 'Z wzoru referencyjnego',
    isLayoutRef: true,
    direction:
      'LAYOUT IS DEFINED BY THE REFERENCE BANNER (see LAYOUT REFERENCE MANDATE below). Replicate its spatial structure exactly — zone proportions, compositional flow, hero placement, CTA position — while replacing all brand elements with this brand\'s identity, colors, and content.',
    mood:
      'DEFINED BY REFERENCE BANNER — preserve the visual energy and register of the reference; adapt it to this brand\'s tone.',
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
  gdn: `Keep all key elements (headline, product, CTA button) well within the canvas with generous breathing room from every edge. All text combined must cover no more than 20% of the total image surface — imagery must dominate visually. Include a clearly visible, rounded CTA button. Do not include phone UI, browser chrome, QR codes, or any social platform interface elements.`,

  'gdn-leaderboard': `The composition must flow in a single horizontal line from left to right — headline, product element (if any), and CTA arranged side by side, never stacked vertically. No tall design elements. All content well within the canvas with generous breathing room on all sides. Maximum contrast for legibility. Text combined must not exceed 20% of the total image surface.`,

  'gdn-billboard': `The composition spans the full width with a cinematic, horizontal layout — a strong visual on one side balanced by headline and CTA on the other, or a full-width scene with a horizontal text overlay. All elements must remain well within the canvas. Text combined must not exceed 20% of the total image surface.`,

  'gdn-skyscraper': `The composition must stack elements top-to-bottom: brand visual at the top, headline in the middle, CTA at the bottom. Absolutely no horizontal spreading of elements — everything must fit within the narrow width. Generous breathing room from left and right edges. Text combined must not exceed 20% of the total image surface.`,

  'gdn-mobile': `Extreme minimalism is mandatory: one short bold headline maximum, no body copy, no decorative detail elements. Single horizontal flow — no vertical stacking. Everything well within the canvas. Maximum contrast between text and background is critical for legibility at this tiny scale. Text must not exceed 20% of the total image surface.`,

  meta: `Keep the very top and the very bottom of the image as pure background or scene only — platform UI covers these areas on mobile. Concentrate headline, product, and CTA in the central portion of the image with generous breathing room from every edge. Keep text minimal — fewer words, larger type — imagery must dominate. Place the CTA button in the lower-center area, well clear of the bottom edge. Do not include any social media interface elements.`,

  'meta-stories': `Do not include a CTA button anywhere in the image. Do not include any social media interface elements, app chrome, navigation bars, profile headers, avatars, usernames, timestamps, action icons, or reply boxes — the final image must be pure ad creative.

CANVAS FILL — NON-NEGOTIABLE: The background color, gradient, or scene MUST extend edge-to-edge across the ENTIRE canvas — from the very top pixel row to the very bottom pixel row, left to right. There must be absolutely no white strips, no grey borders, no empty margins, and no letterboxing of any kind. Every single pixel of the canvas must be filled with the brand background color or a continuous scene.

CONTENT-FREE ZONES (background fills these, content does not): The top 14% of the image must show only the continuation of the background color or scene — no text, no product, no design element may enter this zone. The bottom 33% must similarly show only the background continuation — platform controls cover this area. All visible content (headline, visuals) must be placed in the safe middle zone between these two margins. Place the headline centered horizontally in this safe zone. Design for immediate impact — the message must be understood within one second.`,

  programmatic: `Keep all content well within the canvas with generous breathing room from every edge. Prioritize legibility at small display sizes — use large, bold text and avoid fine details that disappear when scaled down. Ensure high contrast between text and background. Include a clearly visible CTA button. Keep the composition simple, bold, and immediately legible.`,

  linkedin: `Professional, business-oriented visual tone — this is a business platform, so avoid overly casual or consumer-lifestyle aesthetics. Keep all content well away from every edge of the image. Lead with a clear value proposition for professionals. A concise headline plus short descriptor is appropriate. Include a CTA button in the lower third. Typography must be clean and professional. Overall feel: credible, premium, business-ready.`,

  tiktok: `No CTA button in the image — the platform overlays its own. Place all content — headline, product, visuals — strictly in the left-center area of the frame: the large bottom portion, the very top, and the entire right side must show only clean background, since the platform interface covers these areas. Visual style: bold, energetic, high-contrast, designed for immediate thumb-stopping impact. Large, bold headline readable in under one second.`,

  'tiktok-other': `Bold, energetic, youth-oriented visual style designed for immediate scroll-stopping impact. Large, bold headline readable in under one second. No CTA button in the image — the platform overlays its own. Keep all content well within the canvas with generous breathing room from every edge. Authentic, dynamic aesthetic — avoid overly polished corporate look. Design for mobile-first viewing.`,
}

function resolveGpt2ChannelReqs(format, { isStories, isTikTokVertical, hasGdn }) {
  if (isStories) return CHANNEL_REQS['meta-stories']
  if (isTikTokVertical) return CHANNEL_REQS.tiktok
  if (format.channel === 'tiktok') return CHANNEL_REQS['tiktok-other']

  if (hasGdn || format.channel === 'gdn') {
    const ratio = format.width / format.height
    if (format.height <= 60) return CHANNEL_REQS['gdn-mobile']
    if (ratio >= 7) return CHANNEL_REQS['gdn-leaderboard']
    if (ratio >= 3) return CHANNEL_REQS['gdn-billboard']
    if (ratio <= 0.35) return CHANNEL_REQS['gdn-skyscraper']
    return CHANNEL_REQS.gdn
  }

  if (format.channel === 'meta') return CHANNEL_REQS.meta
  if (format.channel === 'linkedin') return CHANNEL_REQS.linkedin
  return CHANNEL_REQS.programmatic
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
  hasLogo,          // boolean — true when a real logo will be composited onto the banner
  compInsight,      // string or null
  notes,            // string or null
  campaignChannels, // string[]
  language = 'Polish', // English name of the language for all text in the image
}) {
  const variant = VARIANT_MATRIX[variantIndex % VARIANT_MATRIX.length]
  const isLayoutRef = !!variant.isLayoutRef

  const hasGdn = (campaignChannels || []).some((c) => c.includes('Google'))
  const isStories = !hasGdn && format.channel === 'meta' && format.ar === '9:16'
  const isTikTokVertical = format.channel === 'tiktok' && format.ar === '9:16'

  const channelReqs = resolveGpt2ChannelReqs(format, { isStories, isTikTokVertical, hasGdn })

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

  // Logo instruction: reserve clean corner only when a real logo will be composited
  const logoInstruction = hasLogo
    ? `Do not render the brand name "${brand.name}" as a standalone floating text element, wordmark, watermark, badge, seal, monogram, or decorative typographic element anywhere outside of product labels or packaging. The brand name may appear naturally on product packaging or labels as part of the product itself. Leave at least one corner (top-left preferred) naturally uncluttered — filled only with pure background color or texture, no objects, text, or design elements — so a real brand logo can be placed there later. This clean corner must look like a natural extension of the background, not a reserved placeholder box or empty geometric shape.`
    : `Do not render the brand name "${brand.name}" as a standalone floating text element, wordmark, watermark, badge, seal, monogram, or decorative typographic element anywhere outside of product labels or packaging. The brand name may appear naturally on product packaging or labels as part of the product itself.`

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

  // Minimal brand swap info for layout-ref mode — no color/style mandates that fight the reference
  const layoutRefBrandInfo = `BRAND SWAP INFO — only these 3 elements change from the reference:
- Brand name: ${brand.name}${brand.domain ? ` (${brand.domain})` : ''}${brand.industry ? ` | ${brand.industry}` : ''}
- Logo: will be composited onto the banner — leave the same corner clean as in the reference
- Headline + CTA text: see AD TEXT section below — render in the same font style, weight, and position as the reference

⚠️ Do NOT apply any color palette, typography mandates, or visual style directives from brand data — the reference banner is the SOLE visual authority.`

  const prompt = `Create a production-ready ${channelLabel} advertising banner${isLayoutRef ? ` for ${brand.name}` : ` for ${brand.name}${brand.domain ? ` (${brand.domain})` : ''}`}.

IMAGE SIZE: ${format.width}×${format.height} pixels, aspect ratio ${format.ar}.

${isLayoutRef ? layoutRefBrandInfo : `BRAND IDENTITY — this ad must look like it was made by ${brand.name}'s own design team. Someone who knows the brand's website must instantly recognize it. Every color, font, and visual choice must match this brand exactly — do not use generic ad aesthetics.
${brandCtx}`}
${isLayoutRef ? '' : `
${GOAL_DIRECTIVES[brand.campaignGoal] || GOAL_DIRECTIVES['Conversion (Sprzedaż)']}
`}
⚠️ LANGUAGE MANDATE — NON-NEGOTIABLE: ALL visible text rendered inside this image — the headline, the CTA button label, any tagline, descriptor, or body copy — MUST be written in ${language}. This is absolute. Every single word of visible text must be in ${language}. Do not use any other language anywhere in the image.

CREATIVE DIRECTION — Variant ${variantIndex + 1} (${variant.name}):
${isLayoutRef ? `🎯 REFERENCE BANNER REPLICATION — MAXIMUM VISUAL FIDELITY MODE

The attached reference banner is the SINGLE SOURCE OF TRUTH for ALL visual decisions.
Your goal: produce a banner that is visually INDISTINGUISHABLE from the reference at first glance.
Someone seeing both side-by-side must immediately recognise the same design template.

⚡ BACKGROUND — HIGHEST PRIORITY, NON-NEGOTIABLE:
Study the reference background carefully and reproduce it with absolute precision:
- If reference has a clean white or off-white background → use exactly that; do NOT shift it to grey, lavender, beige, or cream
- If reference has a gradient → reproduce the exact gradient direction, colors, and proportions
- If reference has a dark footer bar or bottom strip → reproduce it at the same height, same color, same style
- Any deviation from the reference background is an automatic failure

✅ REPLICATE EXACTLY — every one of these must match the reference (do NOT change):
- Background: exact color(s), any gradient, any texture — see above
- All colors everywhere: accent color, highlight color, 3D object colors, button color, decorative element colors — all from the reference
- Fixed brand template elements: any small text in corners (top-right agency name, tagline under logo area), footer bars, gradient strips, decorative lines or badges — replicate these in the same position, same style, same approximate text
- Layout zones: exact spatial relationships — where the image cluster lives, where the text lives, where the CTA lives, same proportions
- Imagery style: if reference uses 3D renders → use 3D renders; if photography → photography; replicate the same visual language
- Visual elements: every floating object, icon, arrow, chart, prop in the reference — same type, same approximate position and scale
- Typography style: match the font weight (heavy/black if reference uses heavy), text color, capitalization, and size hierarchy — headline weight, subline weight, the ratio between them
- Shadows, depth, lighting, perspective — same render style throughout
- Spacing and breathing room — same margins, same density of elements

🔄 REPLACE ONLY THESE 2 THINGS:
1. Main headline text → use the text from AD TEXT section below — same font weight, same color, same position as the headline in the reference
2. CTA button label → use the CTA from AD TEXT — same button shape, same color, same position as in the reference

⚠️ STRICT PROHIBITIONS:
- Do NOT shift the background color — white stays white, not lavender or beige
- Do NOT add visual elements not present in the reference
- Do NOT remove visual elements present in the reference
- Do NOT apply brand color palette or editorial style rules — reference is the only authority
- Do NOT invent new decorative elements or change the rendering style of existing ones` : `${variant.direction}
Atmosphere and mood: ${variant.mood}`}
${!isLayoutRef && variant.name === 'Typograficzny Bold' ? `⚡ COLOR-CRITICAL: The ENTIRE canvas background MUST be exactly ${brand.colors?.primary}. No photography, no gradient — pure brand color block. All text in a high-contrast color that works against this background. CTA button in ${brand.ctaColor || brand.colors?.accent}.
` : ''}${!isLayoutRef && variant.name === 'Gradient Premium' ? `⚡ COLOR-CRITICAL: Gradient MUST be built from ${brand.colors?.primary} → ${brand.colors?.secondary} ONLY — these two brand hex values are the only colors in the gradient. No photography. No other colors.
` : ''}${!isLayoutRef && !hasProductImage ? `No specific product image was provided. Show a lifestyle scene or atmospheric visual that evokes the brand's world and product category (${brand.productType || brand.industry || 'this brand'}) — use a beautiful, representative, unlabeled prop or a scene that implies the product without showing a specific item.` : ''}${!isLayoutRef && compInsight ? `\n\nCOMPETITIVE CONTEXT: ${compInsight} Create clear visual contrast with competitors — the ad must stand out, not blend in.` : ''}
${isLayoutRef ? '' : `
KEY MESSAGE: ${brand.usp || primaryLine}
${brand.audience ? `TARGET AUDIENCE: ${brand.audience}` : ''}
${notes ? `⚡ CLIENT AD COPY — ABSOLUTE PRIORITY (read before AD TEXT section below):
${notes}

⚠️ COPY MANDATE — NON-NEGOTIABLE:
Scan the text above for any headline, slogan, tagline, or CTA.
Recognition rules — treat as client copy if you see ANY of:
  • a short phrase or sentence that reads like an ad headline or slogan
  • text labeled with: "Hasło:", "Nagłówek:", "Headline:", "Tekst:", "Slogan:", "CTA:", "Przycisk:", "Button:"
  • an imperative phrase that could serve as a call-to-action

IF client copy IS found:
  → Use it VERBATIM — not paraphrased, not improved, not substituted
  → It REPLACES the headline and/or CTA in AD TEXT section below
  → Do NOT render any AI-invented headline or CTA anywhere on the banner
  → ONLY the client's exact words may appear as headline/CTA on this image

IF no identifiable headline or CTA is found in the text above:
  → Use AD TEXT section below normally` : ''}

VISUAL COMPOSITION REQUIREMENTS:
The image must be a finished, editorial-quality advertising image — not a generic digital banner. Photography or imagery must dominate at least 60% of the canvas. The composition must feel intentionally designed: every element has deliberate placement, visual tension, and breathing room. It must feel like a high-end magazine editorial or a premium brand campaign. Do not use a flat solid-color background with text floating in the middle, blank white or grey background with a product cutout, clip-art or stock-photo-generic style, corporate brochure grid layout, or gradient blob with copy.
`}
AD TEXT${notes ? ' — USE ONLY IF CLIENT AD COPY ABOVE CONTAINS NO HEADLINE/CTA' : ''}:
${textBlock}

${logoInstruction}

${channelReqs}

OUTPUT: Sharp, high-resolution, production-ready image that looks like a real published advertisement. Do not render any measurement labels, pixel values, margin indicators, percentage markers, crop marks, dashed zone borders, dimension arrows, or any technical annotations. The final image must be pure ad creative — never a design spec sheet, mood board, or style guide. The background must fill the entire canvas from edge to edge — no white strips, no grey bands, no empty margins, no letterboxing of any kind.`

  return prompt
}

export { VARIANT_MATRIX }
