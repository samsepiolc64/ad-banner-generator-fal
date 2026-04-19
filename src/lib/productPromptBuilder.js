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
    description: 'authentic lifestyle photography — natural, candid moment, real environment',
    light: 'soft natural daylight from a window or overhead sky, warm and realistic',
  },
  studio: {
    description: 'clean studio product photography — seamless backdrop, controlled lighting',
    light: 'professional softbox lighting with subtle shadow, neutral or brand-aligned backdrop color',
  },
  outdoor: {
    description: 'outdoor lifestyle shot — real outdoor location, natural surroundings',
    light: 'golden hour natural sunlight or bright overcast daylight',
  },
  minimalist: {
    description: 'minimalist editorial composition — clean negative space, refined styling',
    light: 'soft diffused light, gentle shadows, muted neutral palette',
  },
}

function describeModel(model) {
  if (!model) return null
  const parts = []
  const gender = GENDER_OPTIONS[model.gender] || 'person'
  const age = AGE_OPTIONS[model.ageRange]
  parts.push(`a ${gender}${age ? ' ' + age : ''}`)

  const hair = HAIR_OPTIONS[model.hairColor]
  const skin = SKIN_OPTIONS[model.skinTone]
  const attrs = [hair, skin].filter(Boolean)
  if (attrs.length) parts.push(`with ${attrs.join(' and ')}`)

  return parts.join(' ')
}

export function buildProductPrompt({
  product,
  scene,
  format,
  brand,
}) {
  const { productName, productType } = product || {}
  const {
    style = 'lifestyle',
    includeModel = true,
    model,
    setting,
    mood,
  } = scene || {}

  const preset = STYLE_PRESETS[style] || STYLE_PRESETS.lifestyle
  const modelDesc = includeModel ? describeModel(model) : null

  const brandCtx = brand
    ? [
        brand.name && `Brand: ${brand.name}.`,
        brand.visualStyle && `Brand visual style: ${brand.visualStyle}.`,
        brand.colors?.primary && `Brand primary color: ${brand.colors.primary}.`,
        brand.photoStyle && `Brand photography direction: ${brand.photoStyle}.`,
      ]
        .filter(Boolean)
        .join(' ')
    : ''

  const productLine = productName
    ? `The product is ${productName}${productType ? ` (${productType})` : ''}.`
    : productType
      ? `The product is a ${productType}.`
      : 'The product in the reference image.'

  const sceneParts = [
    setting && `Scene/environment: ${setting}.`,
    modelDesc && `Include ${modelDesc} naturally using or interacting with the product.`,
    mood && `Mood: ${mood}.`,
  ].filter(Boolean)

  return `Professional product photography for social media.

REFERENCE IMAGE: Use the attached reference image as the EXACT source for the product. Preserve the product's shape, color, label, branding, and all packaging details with maximum fidelity — the product on the generated image must be instantly recognizable as the same product from the reference.

${productLine}

SCENE DIRECTION:
${preset.description}.
Lighting: ${preset.light}.
${sceneParts.join('\n')}

${brandCtx ? `BRAND CONTEXT:\n${brandCtx}\n` : ''}
COMPOSITION:
- Format aspect ratio: ${format.ar} (${format.width}×${format.height})
- Product should be clearly visible and well-framed, not cropped awkwardly
- Composition feels natural and editorial, not staged or stocky
- Color palette complements the product and brand

NEGATIVE PROMPT (avoid):
- Do NOT alter the product's shape, color, or branding
- No text overlays, watermarks, logos, CTAs, taglines, or graphic elements
- No multiple versions of the product unless explicitly requested
- No distorted anatomy on people
- No generic stock-photo feel
- No visible safe-zone markers, measurement labels, or technical annotations`
}

export const MODEL_VARIANTS_PRESET = [
  { name: 'Brunetka', model: { gender: 'female', ageRange: 'adult', hairColor: 'brunette', skinTone: 'medium' } },
  { name: 'Blondynka', model: { gender: 'female', ageRange: 'adult', hairColor: 'blonde', skinTone: 'light' } },
  { name: 'Ruda', model: { gender: 'female', ageRange: 'adult', hairColor: 'red', skinTone: 'fair' } },
  { name: 'Ciemnoskóra', model: { gender: 'female', ageRange: 'adult', hairColor: 'black', skinTone: 'dark' } },
  { name: 'Mężczyzna', model: { gender: 'male', ageRange: 'adult', hairColor: 'brunette', skinTone: 'medium' } },
]
