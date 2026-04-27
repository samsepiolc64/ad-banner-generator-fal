/**
 * Product prompt builder for GPT Image 2 (fal-ai/gpt-image-2).
 *
 * Differences vs. productPromptBuilder.js (Nano Banana):
 *  - No reference image support in t2i — product described from form data (name, type, brand)
 *  - No separate negative_prompt — constraints embedded as positive instructions
 *  - Natural language style
 *  - GPT Image 2 renders Polish text correctly (if any text needed)
 */

const HAIR_OPTIONS = {
  any: '',
  blonde: 'blonde hair',
  brunette: 'brunette hair',
  red: 'red/auburn hair',
  black: 'black hair',
  gray: 'gray hair',
}

const SKIN_OPTIONS = {
  any: '',
  fair: 'fair skin',
  light: 'light skin',
  medium: 'medium-toned skin',
  tan: 'tanned skin',
  dark: 'dark skin',
}

const GENDER_OPTIONS = {
  any: 'person',
  female: 'woman',
  male: 'man',
}

const AGE_OPTIONS = {
  'young-adult': 'in their early 20s',
  adult: 'in their 30s',
  mature: 'in their 40s-50s',
  senior: 'in their 60s+',
}

const STYLE_PRESETS = {
  lifestyle: {
    description: 'authentic lifestyle photography — a natural, candid moment in a real-world environment',
    light: 'soft natural daylight from a window or overhead sky, warm and realistic',
  },
  studio: {
    description: 'clean studio product photography — seamless backdrop, controlled professional lighting',
    light: 'professional softbox lighting with subtle shadow, neutral or brand-aligned backdrop color',
  },
  outdoor: {
    description: 'outdoor lifestyle shot — real outdoor location, natural surroundings',
    light: 'golden hour natural sunlight or bright overcast daylight',
  },
  minimalist: {
    description: 'minimalist editorial composition — generous negative space, refined styling, deliberate placement',
    light: 'soft diffused light, gentle shadows, muted neutral palette',
  },
}

function describeModel(model) {
  if (!model) return null
  const gender = GENDER_OPTIONS[model.gender] || 'person'
  const age = AGE_OPTIONS[model.ageRange]
  const hair = HAIR_OPTIONS[model.hairColor]
  const skin = SKIN_OPTIONS[model.skinTone]
  const attrs = [hair, skin].filter(Boolean)
  const attrStr = attrs.length ? ` with ${attrs.join(' and ')}` : ''
  return `a ${gender}${age ? ' ' + age : ''}${attrStr}`
}

/**
 * Build a GPT Image 2 prompt for product photography.
 * Note: no reference image in t2i — product must be described from form fields.
 */
export function buildGptImage2ProductPrompt({
  product,
  scene,
  format,
  brand,
}) {
  const { type: productType, name: productName } = product || {}
  const {
    style = 'lifestyle',
    includeModel = true,
    model,
    setting,
    mood,
  } = scene || {}

  const preset = STYLE_PRESETS[style] || STYLE_PRESETS.lifestyle
  const modelDesc = includeModel ? describeModel(model) : null

  // Describe the product from available form data
  const productParts = [productName, productType].filter(Boolean)
  const productDescription = productParts.length
    ? productParts.join(' — ')
    : 'the brand\'s product'

  // Brand context
  const brandLines = brand
    ? [
        brand.name ? `Brand: ${brand.name}.` : null,
        brand.visualStyle ? `Brand visual style: ${brand.visualStyle}.` : null,
        brand.colors?.primary ? `Brand primary color: ${brand.colors.primary}.` : null,
        brand.photoStyle ? `Brand photography direction: ${brand.photoStyle}.` : null,
        brand.tone ? `Brand tone: ${brand.tone}.` : null,
      ].filter(Boolean)
    : []

  // Scene details
  const sceneParts = [
    setting ? `Scene / environment: ${setting}.` : null,
    modelDesc ? `Include ${modelDesc} naturally using or holding the product in a genuine, unstaged way.` : null,
    mood ? `Overall mood: ${mood}.` : null,
  ].filter(Boolean)

  const prompt = `Create a professional product photography image for social media.

PRODUCT: ${productDescription}. The product should be the clear visual focal point of the image — well-lit, sharply rendered, and immediately recognizable.

DIMENSIONS: ${format.width}×${format.height} pixels, aspect ratio ${format.ar}.

SCENE DIRECTION:
Style: ${preset.description}.
Lighting: ${preset.light}.
${sceneParts.length ? sceneParts.join('\n') : ''}

${brandLines.length ? `BRAND CONTEXT:\n${brandLines.join('\n')}\n` : ''}
COMPOSITION:
The product must be clearly visible and well-framed — not awkwardly cropped or obscured. The composition should feel natural and editorial, not staged or stock-photo generic. The color palette should complement the product and brand. Imagery should feel authentic and aspirational — like content from a premium brand's own Instagram or lookbook.

VISUAL QUALITY:
Sharp, high-resolution, production-ready product photography. Do not include any text overlays, watermarks, graphic badges, taglines, or call-to-action elements in the image. Do not distort the anatomy of any people in the scene. Do not include any measurement labels, crop marks, safe-zone indicators, or technical annotations — the final image must look like a real published product photograph.`

  return prompt
}

export const MODEL_VARIANTS_PRESET = [
  { name: 'Brunetka', model: { gender: 'female', ageRange: 'adult', hairColor: 'brunette', skinTone: 'medium' } },
  { name: 'Blondynka', model: { gender: 'female', ageRange: 'adult', hairColor: 'blonde', skinTone: 'light' } },
  { name: 'Ruda', model: { gender: 'female', ageRange: 'adult', hairColor: 'red', skinTone: 'fair' } },
  { name: 'Ciemnoskóra', model: { gender: 'female', ageRange: 'adult', hairColor: 'black', skinTone: 'dark' } },
  { name: 'Mężczyzna', model: { gender: 'male', ageRange: 'adult', hairColor: 'brunette', skinTone: 'medium' } },
]
