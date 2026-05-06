/**
 * Prompt builder — generates fal.ai prompts based on the skill's template.
 * This is the template-based version (no Claude API needed).
 * When Claude API is available, this can be enhanced with AI-generated prompts.
 */

export const VARIANT_MATRIX = [
  {
    name: 'Hero lifestyle',
    layout: 'Full-bleed lifestyle photograph fills the entire canvas; headline and CTA float over a cinematic dark gradient in the lower portion — image dominates, text is secondary',
    hero: 'A person naturally using, wearing, or experiencing the product in an authentic real-world moment — not staged, feels candid and editorial',
    bg: 'Real-world environment appropriate for the brand (home interior, outdoor setting, café, nature) with a subtle dark gradient overlay only where text needs to be legible',
    mood: 'Warm, cinematic, editorial — feels like a spread from a premium lifestyle magazine; natural light, genuine emotion, real-life story',
  },
  {
    name: 'Product w scenie',
    layout: 'Product styled as the hero, placed naturally in a rich atmospheric environment with complementary props; text overlaid on a contrasting area or side panel',
    hero: 'Product photographed as if from a luxury brand lookbook — carefully styled with relevant props, textures, and contextual elements that tell its story',
    bg: 'Atmospheric, tactile surface or environment that matches the product\'s world: marble, linen, wood grain, botanical elements, or brand-appropriate setting; rich texture',
    mood: 'Aspirational, tactile, curated — like a premium brand\'s own Instagram content or editorial catalog shot',
  },
  {
    name: 'Editorial split',
    layout: 'Bold vertical split: left half — atmospheric lifestyle photography; right half — solid brand-color panel with headline and CTA; hard geometric division between image and color',
    hero: 'Striking lifestyle or product photograph on one side — strong composition that holds its own in half the frame',
    bg: 'Left: rich photographic scene; Right: brand primary or deepest color — high contrast between the two halves creates modern editorial tension',
    mood: 'Modern, magazine-editorial, confident — the geometry feels designed, not templated; echoes high-end fashion and luxury brand campaigns',
  },
  {
    name: 'Immersive cinematic',
    layout: 'Full-bleed edge-to-edge scene with cinematic wide composition; minimal text floated over a naturally dark area of the image — zero empty background, zero padding',
    hero: 'Wide, immersive lifestyle scene or dramatic product moment that fills every pixel — composition tells a story without needing much text',
    bg: 'The photography itself IS the background — no separate panels or color areas; scene naturally provides contrast zones for text placement',
    mood: 'Cinematic, dramatic, high-impact — feels like a film still or a luxury car campaign; atmosphere over information',
  },
  {
    name: 'Minimalist éditorial',
    layout: 'Generous negative space with one precisely placed visual element — product detail or single lifestyle accent; typography secondary to the image',
    hero: 'A single, carefully chosen visual: close-up product texture, a detail shot from a lifestyle scene, or one striking prop — quality over quantity',
    bg: 'Light, airy background — white or very light brand neutral; perhaps a subtle texture or gradient; the emptiness is intentional and luxurious',
    mood: 'Quietly luxurious, calm, premium — like a high-end fragrance or jewellery ad; the restraint communicates exclusivity',
  },
  {
    name: 'Typograficzny Bold',
    layout: 'Brand color fills the entire canvas as a solid or near-solid color block; oversized headline dominates at least 50% of the canvas — typography IS the hero; a single product shot or brand icon serves as supporting anchor only; zero complex photography',
    hero: 'The headline itself — set in heavy type (weight 700–900) that commands immediate attention at any banner size; product or minimal brand element plays supporting role',
    bg: 'Solid brand primary or secondary color — rich, saturated, unapologetic; may include subtle texture or gentle gradient variation but NO photography; pure color-block approach',
    mood: 'Bold, direct, confident — like a protest poster or a luxury brand statement campaign; impossible to miss from 320×50 mobile banner to 970×250 billboard',
  },
  {
    name: 'Gradient Premium',
    layout: 'Rich gradient built from brand primary and secondary colors sweeps the entire canvas — not a flat color, not a photograph; product or abstract brand element floats on the gradient field; headline and CTA placed in the most contrasting zone of the gradient',
    hero: 'Product or abstract brand element cleanly isolated against the gradient — lifted out of context, slightly luminous, prestigious; the gradient itself communicates premium quality',
    bg: 'Deep, rich gradient from brand primary to brand secondary — NOT a generic web gradient; the gradient has depth, warmth, and direction; may include subtle lens flare or inner glow; no photography',
    mood: 'Premium, modern, aspirational — like a luxury tech product launch or a high-end fragrance campaign; the gradient communicates quality without needing photography',
  },
  {
    name: 'Social Proof',
    layout: 'Oversized social proof element — key statistic, rating, or powerful one-liner — dominates the composition as the visual hero; set in XXL bold type; brand color background; supporting product or subtle lifestyle element placed below or beside the stat',
    hero: 'The proof itself: a large number ("4.9★", "+340% sprzedaży", "10 000 klientów"), percentage, or short punchy quote — the undisputed focal point that immediately communicates authority and trust',
    bg: 'Brand primary color or deep neutral — clean and bold; no complex photography that competes with the message; the number or stat must be the undisputed visual focal point',
    mood: 'Trustworthy, authoritative, evidence-driven — like a financial results announcement or award banner; confidence comes from proven results, not aesthetic beauty',
  },
  {
    name: 'UGC / Authentic',
    layout: 'Raw, organic, deliberately imperfect aesthetic — as if filmed or shot by a real customer or creator in their everyday environment; natural composition, no studio styling; headline placed like a caption or organic text overlay, not a designed ad element',
    hero: 'A real-looking person naturally interacting with the product in their everyday environment — kitchen, street, gym, living room; energy and authenticity over polish and perfection',
    bg: 'Real-world environment with natural, imperfect light — slightly uneven, genuine; may include subtle film grain or natural vignette; deliberately NOT studio-produced',
    mood: 'Authentic, energetic, relatable — stops the scroll because it looks like organic content, not advertising; ideal for TikTok and Meta Stories; feels like a trusted friend\'s recommendation',
  },
  {
    name: 'Ze wzoru referencyjnego',
    isLayoutRef: true,
    layout: 'DEFINED BY REFERENCE BANNER — replicate the spatial structure, zone proportions, and compositional flow of the attached reference banner exactly',
    hero: 'DEFINED BY REFERENCE BANNER — mirror the hero element type and placement from the reference (product, person, graphic); replace with this brand\'s content',
    bg: 'DEFINED BY REFERENCE BANNER — match the background type (photo, color block, gradient) and its proportions from the reference; replace colors with this brand\'s palette',
    mood: 'DEFINED BY REFERENCE BANNER — preserve the overall visual energy and register from the reference; adapt to this brand\'s tone',
  },
]

const CHANNEL_REQUIREMENTS = {
  gdn: `Keep all key elements (headline, product, CTA) well within the canvas — generous breathing room from every edge, no content touching borders. Static image, no animation, no implied interactivity. CTA button clearly visible and readable. No phone, browser, or OS interface elements. No QR codes. TEXT COVERAGE HARD LIMIT: all text elements combined — headline, CTA, any body copy — must cover no more than one fifth of the total image surface; imagery and visuals must dominate.`,

  'gdn-leaderboard': `This is an ultra-wide horizontal banner format. The composition must flow in a single horizontal line from left to right — headline, product element (if any), and CTA arranged side by side, never stacked vertically. No tall design elements. All content well within the canvas with generous breathing room on all sides. High contrast mandatory. Text combined must not exceed 20% of the total image surface.`,

  'gdn-billboard': `This is a wide panoramic banner format. The composition spans the full width with a cinematic, horizontal layout — a strong visual on one side balanced by headline and CTA on the other, or a full-width scene with a horizontal text overlay. All elements must remain well within the canvas. Text combined must not exceed 20% of the total image surface.`,

  'gdn-skyscraper': `This is an extremely narrow vertical banner format. The composition must stack elements top-to-bottom: brand visual at the top, headline in the middle, CTA at the bottom. Absolutely no horizontal spreading of elements — everything must fit within the narrow width. Generous breathing room from left and right edges. Text combined must not exceed 20% of the total image surface.`,

  'gdn-mobile': `This is an ultra-small mobile banner. Extreme minimalism is mandatory: one short bold headline maximum, no body copy, no decorative detail elements. Single horizontal flow — no vertical stacking. Everything well within the canvas. Maximum contrast between text and background is critical for legibility at this tiny scale. Text must not exceed 20% of the total image surface.`,

  meta: `Keep the very top and the very bottom of the image as pure background or scene only — no text, no CTA anywhere near the top or bottom edges, since platform controls overlap these areas on mobile. Place headline, product, and CTA in the central portion of the image with generous breathing room from every edge. Keep text minimal — fewer words, larger type; imagery must dominate. Place the CTA button in the lower-center portion of the composition, well clear of the bottom edge. No social platform interface elements of any kind.`,

  'meta-stories': `NO CTA button anywhere in the image — none whatsoever. DO NOT render any social platform UI, app chrome, navigation bars, profile headers, avatars, usernames, timestamps, action icons, or send/reply boxes — the final image must be pure ad creative with zero interface elements. (Meta Ads Stories / Reels format)

CANVAS FILL — NON-NEGOTIABLE: The background color, gradient, or scene MUST extend edge-to-edge across the ENTIRE canvas — from the very top pixel row to the very bottom pixel row, left to right. There must be absolutely no white strips, no grey borders, no empty margins, and no letterboxing of any kind. Every single pixel of the canvas must be filled with the brand background color or a continuous scene.

CONTENT-FREE ZONES (background fills these, content does not): The top 14% of the image must show only the continuation of the background color or scene — no text, no product, no design element may enter this zone. The bottom 33% must similarly show only the background continuation — platform controls cover this area. All visible content (headline, visuals) must be placed in the safe middle zone between these two margins. Place the headline centered horizontally in this safe zone. Design for immediate impact — the message must be understood within one second.`,

  programmatic: `Keep all content well within the canvas with generous breathing room from every edge — ads appear at many sizes and cropping must never cut content. Legibility at small display sizes is the top priority: use large, bold text; avoid thin strokes, fine details, or small decorative elements that disappear when scaled down. High contrast between all text and background is mandatory. CTA button must be clearly visible and the action immediately obvious. Avoid overly complex compositions — simple, bold visuals perform best across placements.`,

  linkedin: `Professional, business-oriented visual tone — this is a business platform; avoid overly casual, playful, or consumer-lifestyle aesthetics. Keep all content well away from every edge of the image — platform UI overlaps the sides on mobile; generous breathing room on all sides. The message must be immediately clear to a professional scrolling their feed — lead with the value proposition. A concise headline plus short descriptor is appropriate, but keep it clean and readable. No platform interface elements, profile picture mocks, or connection count mockups. CTA button placed in the lower third, clearly readable, professional color. Typography: clean, professional sans-serif; avoid decorative or script fonts. Overall feel: credible, premium, business-ready.`,

  tiktok: `No CTA button text in the image — the platform overlays its own. Place all content — headline, product, visuals — strictly in the left-center area of the frame: the large bottom portion, the very top, and the entire right side must show only clean background, since the platform interface covers these areas. Visual style: bold, energetic, high-contrast, youth-oriented; design for immediate thumb-stopping impact. Large, bold headline — designed to be read in under one second. Authentic, dynamic aesthetic — avoid overly polished corporate look; prefer vivid colors and energy. Design for mobile-first, full-screen viewing.`,

  'tiktok-other': `Bold, energetic, youth-oriented visual style designed for immediate scroll-stopping impact. Large, bold headline readable in under one second. No CTA button in the image — the platform overlays its own. Keep all content well within the canvas with generous breathing room from every edge. Authentic, dynamic aesthetic — avoid overly polished corporate look. Design for mobile-first viewing.`,
}

/**
 * Resolve channel requirements based on channel and format dimensions.
 * Returns format-specific rules for extreme GDN aspect ratios and TikTok variants.
 */
function resolveChannelReqs(format, { isStories, isTikTokVertical, hasGdn }) {
  if (isStories) return CHANNEL_REQUIREMENTS['meta-stories']
  if (isTikTokVertical) return CHANNEL_REQUIREMENTS.tiktok
  if (format.channel === 'tiktok') return CHANNEL_REQUIREMENTS['tiktok-other']

  if (hasGdn || format.channel === 'gdn') {
    const ratio = format.width / format.height
    if (format.height <= 60) return CHANNEL_REQUIREMENTS['gdn-mobile']
    if (ratio >= 7) return CHANNEL_REQUIREMENTS['gdn-leaderboard']
    if (ratio >= 3) return CHANNEL_REQUIREMENTS['gdn-billboard']
    if (ratio <= 0.35) return CHANNEL_REQUIREMENTS['gdn-skyscraper']
    return CHANNEL_REQUIREMENTS.gdn
  }

  if (format.channel === 'meta') return CHANNEL_REQUIREMENTS.meta
  if (format.channel === 'linkedin') return CHANNEL_REQUIREMENTS.linkedin
  return CHANNEL_REQUIREMENTS.programmatic
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
  headline,         // string — may contain \n to separate primary from secondary line
  cta,              // string
  hasProductImage,  // boolean — true when caller is supplying a product reference image
  compInsight,      // string or null
  notes,            // string or null
  modelInfo,        // { type, ar, needsResize } from resolveModel()
  campaignChannels, // string[] — selected channels from campaign form
  language = 'Polish', // English name of the language for all text in the image
}) {
  const variant = VARIANT_MATRIX[variantIndex % VARIANT_MATRIX.length]
  const isLayoutRef = !!variant.isLayoutRef
  const hasGdn = (campaignChannels || []).some((c) => c.includes('Google'))
  const isStories = !hasGdn && format.channel === 'meta' && format.ar === '9:16'
  const isTikTokVertical = format.channel === 'tiktok' && format.ar === '9:16'

  const channelReqs = resolveChannelReqs(format, { isStories, isTikTokVertical, hasGdn })

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
  const ctaHex = brand.ctaColor || brand.colors.accent || brand.colors.primary

  // Full color palette block — used when research returns 4–6 keyed colors
  const colorPaletteBlock = brand.colorPalette?.length
    ? `\nFULL COLOR PALETTE — all brand colors, use them all:\n${brand.colorPalette.map((c) => `  ${c.hex} → ${c.role}`).join('\n')}`
    : ''

  // Typography: prefer exact font names from research, fall back to description
  const hasExactFonts = brand.headingFont || brand.bodyFont
  const typographyLine = hasExactFonts
    ? [
        brand.headingFont ? `headings: "${brand.headingFont}"` : null,
        brand.bodyFont && brand.bodyFont !== brand.headingFont ? `body text: "${brand.bodyFont}"` : null,
      ].filter(Boolean).join(' / ')
    : null

  // Layout-ref mode: only logo + text swap — no brand identity info that could fight the reference
  const layoutRefBrandInfo = `LAYOUT REFERENCE MODE — replicate the attached reference banner exactly:
- Logo: provided in the LOGO section below — place it in the same position as the logo in the reference banner
- Headline + CTA text: see AD COPY PLACEMENT below — render in the same font style, weight, and position as in the reference

⚠️ Do NOT apply any brand name, color palette, typography rules, or visual style from any brand data — the reference banner is the SOLE visual authority.`

  const brandDna = `⚡ BRAND CONSISTENCY MANDATE: This ad must look like it was made by ${brand.name}'s own design team. Someone who knows the ${brand.domain} website must instantly recognize it. Do NOT use generic ad aesthetics — every color, font, and visual choice must match THIS brand exactly.

BRAND: ${brand.name}{{BRAND_NAME_SUPPRESS}} | ${brand.domain}${brand.industry ? ` | ${brand.industry}` : ''}${brand.productType ? `
WHAT THEY SELL: ${brand.productType}` : ''}

COLOR SYSTEM — use these exact colors in the roles described:
- ${brand.colors.primary} → primary brand color (dominant backgrounds, hero areas)
- ${brand.colors.secondary} → secondary color (supporting sections, text areas)
- ${brand.colors.accent} → accent / highlight color${brand.ctaColor && brand.ctaColor.toLowerCase() !== brand.colors.accent.toLowerCase() ? `
- ⚡ ${brand.ctaColor} → CTA BUTTON COLOR — this is the ACTUAL button color extracted from the website. ALL call-to-action buttons MUST use exactly this color, no substitutions.` : `
- ${ctaHex} → CTA button color — use for ALL call-to-action buttons`}${brand.colorUsagePattern ? `
- Color usage: ${brand.colorUsagePattern}` : ''}${colorPaletteBlock}

⚡ COLOR MANDATE — NON-NEGOTIABLE: The hex values above ARE this brand's visual DNA. Any substitution with a generic blue, stock-photo orange, default teal, or any color not listed above is an automatic creative failure. Every background, gradient, overlay, and decorative element must be drawn EXCLUSIVELY from the brand colors listed. There are no exceptions.

TYPOGRAPHY:${hasExactFonts ? `
- ⚡ EXACT FONTS from the website: ${typographyLine} — use these font names exactly, or the closest possible visual match if unavailable` : `
- Font style: ${brand.typography || 'modern geometric sans-serif, bold headlines'}`}${brand.tone ? `
- Brand tone: ${brand.tone}` : ''}${brand.brandPersonality ? `
- Personality: ${brand.brandPersonality}` : ''}

VISUAL IDENTITY:
- Style: ${brand.visualStyle || brand.style || 'minimalist, premium feel'}${brand.visualMotifs ? `
- Site motifs (incorporate at least one): ${brand.visualMotifs}` : ''}
- Photography: ${brand.photoStyle || 'lifestyle photography, bright natural light'}${brand.compositionStyle ? `
- Composition style: ${brand.compositionStyle}` : ''}${brand.imageryType ? `
- Imagery type: ${brand.imageryType}` : ''}${brand.lightingMood ? `
- Lighting/mood: ${brand.lightingMood}` : ''}${brand.exampleTaglines?.length ? `
- Actual copy/headlines from the site — match this exact tone: ${brand.exampleTaglines.map((t) => `"${t}"`).join(', ')}` : ''}`

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

${isLayoutRef ? '' : `⚠ MODERN EDITORIAL AESTHETIC — NON-NEGOTIABLE:
1. ALWAYS include real lifestyle photography, a product-in-scene, or an atmospheric visual — text-only compositions are STRICTLY FORBIDDEN
2. Photography or imagery must occupy at least 60% of the canvas visual area — imagery dominates, text supports
3. FORBIDDEN aesthetics (instant fail): flat solid-color background with text floating in the middle · blank white/grey bg with a product cutout · clip-art or stock-photo-generic style · corporate brochure grid layout · template-banner feel · gradient blob with copy
4. The result must feel like a high-end magazine editorial or a premium brand campaign — NOT a generic digital banner
5. Composition must be designed: every element has intentional placement, visual tension, and breathing room — NOT just "image left, text right"
6. Shoot for the feeling of: a luxury fashion campaign · a premium lifestyle brand's Instagram · an editorial spread in a design-forward magazine

`}${isLayoutRef ? layoutRefBrandInfo : brandDna}

{{LOGO_BLOCK}}
${cropZone}${isLayoutRef ? (notes ? `\n⚡ CLIENT AD COPY — THESE EXACT WORDS ONLY (highest priority, overrides AD COPY PLACEMENT):
${notes}

⚠️ VERBATIM MANDATE: Use the text above EXACTLY as written — not paraphrased, not improved, not reordered. These words replace the headline and/or CTA in AD COPY PLACEMENT below.` : '') : `${GOAL_DIRECTIVES[brand.campaignGoal] || GOAL_DIRECTIVES['Conversion (Sprzedaż)']}

Key message: ${brand.usp || headline}
${brand.audience ? `Target audience: ${brand.audience}` : ''}
${compInsight ? `\nCOMPETITIVE CONTEXT:\n- Market landscape: ${compInsight}\n- Differentiation directive: CREATE CONTRAST with competitors — stand out, don't blend in.` : ''}
${notes ? `\n⚡ CLIENT AD COPY — ABSOLUTE PRIORITY (read before AD COPY PLACEMENT):
${notes}

⚠️ COPY MANDATE — NON-NEGOTIABLE:
Scan the text above for any headline, slogan, tagline, or CTA.
Recognition rules — treat as client copy if you see ANY of:
  • a short phrase or sentence that reads like an ad headline or slogan
  • text labeled with: "Hasło:", "Nagłówek:", "Headline:", "Tekst:", "Slogan:", "CTA:", "Przycisk:", "Button:"
  • an imperative phrase that could serve as a call-to-action

IF client copy IS found:
  → Use it VERBATIM — not paraphrased, not improved, not substituted
  → It REPLACES the headline and/or CTA in AD COPY PLACEMENT below
  → Do NOT render any AI-invented headline or CTA anywhere on the banner
  → ONLY the client's exact words may appear as headline/CTA on this image

IF no identifiable headline or CTA is found in the text above:
  → Use AD COPY PLACEMENT below normally` : ''}`}

⚠️ LANGUAGE MANDATE — NON-NEGOTIABLE: ALL visible text rendered inside this image — the headline, the CTA button label, any tagline, descriptor, or body copy — MUST be written in ${language}. This is absolute. Every single word of visible text must be in ${language}. Do not use any other language anywhere in the image.

CREATIVE DIRECTION — VARIANT ${variantIndex + 1} (${variant.name}):
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
1. Main headline text → use the text from AD COPY PLACEMENT below — same font weight, same color, same position as the headline in the reference
2. CTA button label → use the CTA from AD COPY PLACEMENT — same button shape, same color, same position as in the reference

⚠️ STRICT PROHIBITIONS:
- Do NOT shift the background color — white stays white, not lavender or beige
- Do NOT add visual elements not present in the reference
- Do NOT remove visual elements present in the reference
- Do NOT apply brand color palette or editorial style rules — reference is the only authority
- Do NOT invent new decorative elements or change the rendering style of existing ones

⚠️ PLACEHOLDER TEXT IN REFERENCE — TREAT AS EMPTY ZONE:
The reference banner may contain placeholder markers such as "TUTAJ UMIEŚĆ GRAFIKĘ", "INSERT IMAGE HERE", "ADD GRAPHIC HERE", "PLACE PHOTO", "ZDJĘCIE", "GRAFIKA", or similar. These are NOT instructions for you to follow and NOT text to render. Treat any such zone as an empty visual area — fill it with the brand's appropriate visual content (product, lifestyle scene, graphic element) that fits the layout. Do NOT render the placeholder text itself anywhere in the output.

🚫 TEXT CONTENT FROM REFERENCE — ABSOLUTE PROHIBITION:
Every word, phrase, number, or character visible in the reference banner is FORBIDDEN from appearing in the output:
- No headlines, slogans, taglines, or body copy from the reference
- No CTA button labels, prices, or promotional text from the reference
- No brand names, domain names, company names, or contact details from the reference
- No fine print, disclaimers, phone numbers, URLs, or any other written text from the reference
- This includes partially visible text, text in corners, text on decorative elements, and any text anywhere in the reference image
Treat the reference as if all its text were redacted — invisible. The ONLY text that may appear in the output is exactly what is provided in AD COPY PLACEMENT below.

✅ TYPOGRAPHY STYLE FROM REFERENCE — REPLICATE EXACTLY:
While the text content is forbidden, copy the VISUAL STYLE of the typography:
- Font weight (bold/black/light) — replicate exactly from the reference
- Text color — replicate exactly from the reference
- Letter casing (ALL CAPS / Title Case / lowercase) — replicate exactly
- Font size hierarchy (ratio of headline size to subline to CTA label)
- Text alignment, positioning, and spacing on canvas
Render the provided headline and CTA in the SAME typographic style as the reference text.

⚡ GRAPHIC ELEMENTS — EXACT REPLICATION:
Every non-text visual element from the reference must be reproduced faithfully:
- 3D rendered objects → reproduce as 3D renders in the same rendering style and lighting
- Icons, arrows, badges, geometric shapes → same shape, same approximate position, same scale
- Decorative lines, strips, bars, dividers → same position, thickness, color, and style
- Background patterns, textures, gradients → same type, same direction, same density
- Floating objects, props, product renders → same style, same approximate arrangement and quantity
- Shadows, glows, depth effects, overlays → same rendering approach throughout
The reference's entire graphic language is fixed — do not replace, remove, or add any graphical element.

⚡ COLOR EXTRACTION MANDATE — NON-NEGOTIABLE:
Extract the exact hex color values directly from the reference banner pixels. Use ONLY those extracted colors — do not invent, approximate, or substitute with any color not visibly present in the reference. Every color in your output (background, accents, text, decorative elements, button) must map precisely to a color from the reference image.

⚡ ELEMENT COUNT CONSTRAINT:
Count every distinct visual element in the reference: each product/object, person, icon, text block, button, badge, decorative shape. Reproduce EXACTLY that number — do not add any element not present in the reference, do not remove any element that is present.

⚡ ZONE PROPORTIONS — PRESERVE EXACTLY:
Study what percentage of the canvas each zone occupies in the reference: the image/visual area, the text/copy area, the decorative element area, and the empty/breathing-room area. Reproduce these same spatial proportions — the visual weight distribution must match the reference.` : `- Layout: ${variant.layout}
- Hero element: ${variant.hero}
- Background: ${variant.bg}
- Mood/atmosphere: ${variant.mood}`}${variant.name === 'Typograficzny Bold' ? `
⚡ COLOR-CRITICAL: The ENTIRE canvas background MUST be exactly ${brand.colors.primary}. This is the single most important rule for this variant — no photography, no gradient, no other background color. All text must be in a high-contrast color that works against ${brand.colors.primary}. Use ${brand.ctaColor || brand.colors.accent} for the CTA button.` : ''}${variant.name === 'Gradient Premium' ? `
⚡ COLOR-CRITICAL: The gradient MUST be built from ${brand.colors.primary} → ${brand.colors.secondary} ONLY — these two brand colors are the ONLY colors in the gradient. No photography, no other colors. The gradient must feel warm, deep, and deliberately branded — not generic.` : ''}${variant.name === 'Lifestyle' ? `
LIFESTYLE SCENE — brand-authentic direction (override generic stock-photo clichés with THIS brand's world):
${brand.photoStyle ? `- Photography character: ${brand.photoStyle}` : '- Natural, editorial lifestyle photography — feels real, not staged'}
${brand.visualMotifs ? `- Brand visual motifs to weave into the scene naturally: ${brand.visualMotifs}` : ''}
${brand.tone ? `- Scene energy must reflect this brand's tone: ${brand.tone}` : ''}
${brand.visualStyle ? `- Overall aesthetic feel: ${brand.visualStyle}` : ''}
${!hasProductImage ? `- No specific product image was provided. Show a lifestyle scene that evokes the brand's world and product category (${brand.productType || brand.industry || 'this brand'}) — use a beautiful, representative, unlabeled prop/product appropriate for the industry, or a scene that implies the product without showing a specific item.` : ''}
The result must feel like content from the brand's own Instagram feed, not a generic ad.` : ''}${!hasProductImage && variant.name !== 'Lifestyle' ? `
PRODUCT/SUBJECT NOTE: No specific product image was provided. Feature a visually compelling, high-quality representation of this brand's product category. Use elegant, unlabeled props or a lifestyle scene — avoid photorealistic packaging with invented labels or logos.` : ''}

${(() => {
  // Auto-detect two-part headlines: split on first \n (from AI) or ". " sentence break (from user)
  const parts = headline.split('\n').map(s => s.trim()).filter(Boolean)
  const primary = parts[0] || headline
  const secondary = parts[1] || null
  const adCopyLabel = isLayoutRef
    ? 'AD COPY PLACEMENT' + (notes ? ' — OVERRIDDEN BY CLIENT AD COPY ABOVE' : '')
    : 'AD COPY PLACEMENT' + (notes ? ' — USE ONLY IF CLIENT AD COPY ABOVE CONTAINS NO HEADLINE/CTA' : '')
  return `${adCopyLabel}:
${secondary
  ? `TYPOGRAPHIC HIERARCHY — critical for visual impact:
- PRIMARY HEADLINE: "${primary}"
  · The dominant, unmissable text element — large, heavy, bold (weight 800–900)
  · Position: upper-center of the content area
  · Visually equivalent to ~70–90pt on a 1080px canvas
- SECONDARY LINE: "${secondary}"
  · Directly below the primary, same horizontal center, clear separation
  · Size: 55–65% of the primary headline's visual size
  · Weight: regular or medium (400–500) — noticeably lighter than the primary
  · The reader's eye MUST land on the primary first, then drift to the secondary`
  : `- Headline: "${primary}" — position: center, size: large, weight: bold`
}${(isStories || isTikTokVertical) ? '' : `

⚡ MANDATORY CTA BUTTON — NON-NEGOTIABLE — THIS MUST APPEAR IN THE IMAGE:
Render a standalone, visually distinct button element clearly separated below the headline:
  · Label: "${cta}" — this exact text, nothing else
  · Shape: pill or rounded rectangle, SOLID color fill (not outline-only, not text-only)
  · Background fill: ${brand.ctaColor || brand.colors.accent} (brand CTA color — use this exact hex)
  · Text color: white, bold, legible at any display size
  · Position: below the headline with clear vertical separation — NOT inline with the headline text
  · This is a required visual element — a banner missing a CTA button is a creative failure`}
${isLayoutRef ? `
⚡ STRICT TEXT MANDATE — NON-NEGOTIABLE:
The ONLY text permitted on this banner is exactly what is listed above (headline${secondary ? ', secondary line' : ''}${!(isStories || isTikTokVertical) ? ', CTA button' : ''}).
Do NOT add any sublines, taglines, descriptors, body copy, fine print, slogans, or any other text invented by the model.
Do NOT reproduce any text from the reference banner image — those words are forbidden.
Zero tolerance: any word not explicitly listed above must not appear anywhere on the banner.` : ''}`
})()}

TYPOGRAPHY REQUIREMENTS:
- All text must be crystal clear and highly legible at any display size
- Headline: substantial, bold, prominent — dominant text element in the composition
- High contrast between text and background for accessibility
- ${hasExactFonts ? `Use these EXACT brand fonts: ${typographyLine}` : `Font style: ${brand.typography || 'modern sans-serif'}`}
- Keep text concise and surrounded by visual breathing room — imagery should dominate the composition
- DASH RULE: if any dash is used in text overlays, use en dash (–) NEVER em dash (—)${format.channel === 'gdn' ? '\n- HARD LIMIT (Google policy): all text combined must cover no more than 20% of the total image surface area' : ''}

PLACEMENT AND COMPOSITION RULES:
${channelReqs}

DO NOT RENDER ANY OF THE FOLLOWING:
${isLayoutRef ? 'any text copied from the reference banner image, any word or phrase visible in the reference image, any slogan or tagline from the reference, any brand name or domain from the reference, any price or offer text from the reference, any fine print from the reference, any text not explicitly listed in AD COPY PLACEMENT above, invented sublines, invented taglines, invented body copy, invented descriptors, additional text beyond the provided headline and CTA, ' : ''}text-only composition, no photography no lifestyle scene, flat color background with only text, blank white background with product cutout floating, solid color background with text floating in center, empty background with text, template banner layout, generic digital banner aesthetic, corporate brochure style, clip art product on plain background, stock photo cliché, gradient blob background, flat vector illustration style, blurry, pixelated, low resolution, deformed text, illegible font, stretched image, distorted proportions, poor lighting, amateur quality, generic stock photo feel, multiple conflicting fonts, floating brand logo outside the product, standalone brand mark in corner, brand wordmark as graphic element outside product packaging, corner badge with brand name, emblem with brand name, medallion with brand name, seal with brand name, sticker with brand name outside product surface, brand watermark in background, brand watermark in corner, URL watermark, duplicate brand logo, brand name rendered as large decorative text, brand monogram as hero element, hallucinated logo, AI-generated logo floating in empty space, any numeric labels, any measurement text, "px" text, pixel values, percentage labels, "min." labels, "max." labels, "margin" text, "safe zone" text, "safe area" text, zone indicator overlays, percentage overlay text, composition percentage markers, dimension arrows, size arrows, size callouts, ruler overlays, ruler marks, corner brackets, registration marks, crop marks, dashed borders indicating zones, dotted rectangles, placeholder boxes with labels, technical diagram markup, blueprint annotations, spec sheet overlays, style guide annotations, mood board labels, white rectangle in corner, white box in corner, white card in corner, gray rectangle in corner, gray box in corner, light gray panel in corner, semi-transparent rectangle, frosted glass rectangle, rounded white box, empty white shape, empty rounded rectangle, logo placeholder shape, logo placeholder box, reserved area indicator, blank white area with distinct edges, white overlay box, white frame in corner, any visible text labels describing image zones or areas, any text indicating "left", "right", "center", "top", "bottom" as position labels, any text reading "headline", "CTA", "logo", "placement", "safe", "zone", "area", "content", "composition", "banner", "ad", "display", "leaderboard", "skyscraper", "billboard", any channel name rendered as text, any format name rendered as text, any technical instruction rendered as visible text in the image${isStories ? ', CTA button, buy now button, shop now button, any interactive element, any text or visual element in the top 14% of the image, any text or visual element in the bottom 33% of the image, any content near the left or right edges, Instagram Stories UI overlay, Instagram Stories chrome, social media app interface, app navigation bar, platform header bar, profile avatar circle, username overlay, account name text, story viewer header, timestamp text, story controls, send message bar, reply box, message input field, heart icon row, share icon, paper plane icon, swipe up indicator, swipe up text, story progress bar, story dots indicator, any simulated mobile phone UI, any simulated app UI, white strip at top of image, white strip at bottom of image, grey strip at top, grey strip at bottom, empty white bar at top, empty white bar at bottom, light colored band at top edge, light colored band at bottom edge, blank top margin, blank bottom margin, letterbox bars, pillarbox bars, canvas padding, image surrounded by white border, image surrounded by grey border, unfilled canvas area, empty canvas area, background color not reaching edges, background not filling full canvas' : ''}${isTikTokVertical ? ', CTA button, buy now button, shop now button, any interactive element, any text or visual element in the top strip of the image, any text or visual element in the bottom 35% of the image, any content near the right edge of the image' : ''}`

  return prompt
}

