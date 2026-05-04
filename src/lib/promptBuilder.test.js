import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { buildPrompt, VARIANT_MATRIX } from './promptBuilder.js'

// ─── Shared fixtures ──────────────────────────────────────────────────────────

const BASE_BRAND = {
  name: 'Verseo',
  domain: 'verseo.pl',
  industry: 'Digital Marketing',
  productType: 'SEO & Ads services',
  colors: { primary: '#1a1a2e', secondary: '#16213e', accent: '#0f3460' },
  ctaColor: '#e94560',
  typography: 'modern geometric sans-serif',
  tone: 'professional, confident',
  style: 'minimalist, premium',
  visualStyle: 'clean, modern',
  photoStyle: 'editorial lifestyle photography',
  brandPersonality: 'Expert, trustworthy, growth-focused',
  usp: 'Kompleksowy marketing cyfrowy od jednej agencji',
  audience: 'SME business owners',
  campaignGoal: 'Conversion (Sprzedaż)',
}

const FMT_1_1_GDN  = { ar: '1:1',  width: 300,  height: 300,  channel: 'gdn' }
const FMT_16_9_GDN = { ar: '16:9', width: 1920, height: 1080, channel: 'gdn' }
const FMT_9_16_META = { ar: '9:16', width: 1080, height: 1920, channel: 'meta' }
const FMT_1_1_META  = { ar: '1:1',  width: 1080, height: 1080, channel: 'meta' }

const MODEL_NB2      = { type: 'nb2',   ar: '1:1',  needsResize: false }
const MODEL_NB2_9_16 = { type: 'nb2',   ar: '9:16', needsResize: false }
const MODEL_NBPRO_RESIZE = { type: 'nbpro', ar: '5:4', needsResize: true }

/** Build a prompt with sensible defaults, allowing selective overrides */
function makePrompt(overrides = {}) {
  return buildPrompt({
    format:           FMT_1_1_GDN,
    variantIndex:     0,
    brand:            BASE_BRAND,
    headline:         'Grow Your Business',
    cta:              'Sprawdź ofertę',
    hasProductImage:  false,
    compInsight:      null,
    notes:            null,
    modelInfo:        MODEL_NB2,
    campaignChannels: ['Google Display'],
    ...overrides,
  })
}

// ─── Helper: assert string contains substring ─────────────────────────────────
function contains(prompt, substr) {
  assert.ok(
    prompt.includes(substr),
    `Prompt should contain: "${substr}"\n\n(Actual excerpt: "${prompt.slice(0, 300)}")`
  )
}
function notContains(prompt, substr) {
  assert.ok(
    !prompt.includes(substr),
    `Prompt should NOT contain: "${substr}"`
  )
}

// ─── VARIANT_MATRIX ───────────────────────────────────────────────────────────

describe('VARIANT_MATRIX', () => {
  it('exports exactly 10 variants', () => {
    assert.equal(VARIANT_MATRIX.length, 10)
  })

  it('contains the correct variant names', () => {
    const names = VARIANT_MATRIX.map((v) => v.name)
    assert.ok(names.includes('Hero lifestyle'))
    assert.ok(names.includes('Product w scenie'))
    assert.ok(names.includes('Editorial split'))
    assert.ok(names.includes('Immersive cinematic'))
    assert.ok(names.includes('Minimalist éditorial'))
    assert.ok(names.includes('Typograficzny Bold'))
    assert.ok(names.includes('Gradient Premium'))
    assert.ok(names.includes('Social Proof'))
    assert.ok(names.includes('UGC / Authentic'))
    assert.ok(names.includes('Z wzoru referencyjnego'))
  })

  for (const variant of VARIANT_MATRIX) {
    it(`variant "${variant.name}" has all required fields`, () => {
      assert.ok(variant.layout, 'missing layout')
      assert.ok(variant.hero,   'missing hero')
      assert.ok(variant.bg,     'missing bg')
      assert.ok(variant.mood,   'missing mood')
    })
  }
})

// ─── Two-part headline hierarchy ─────────────────────────────────────────────

describe('two-part headline hierarchy', () => {
  it('renders TYPOGRAPHIC HIERARCHY block when headline has \\n', () => {
    const prompt = makePrompt({ headline: 'Zacznij rosnąć\nKompleksowy marketing od jednej agencji' })
    contains(prompt, 'TYPOGRAPHIC HIERARCHY')
    contains(prompt, 'PRIMARY HEADLINE: "Zacznij rosnąć"')
    contains(prompt, 'SECONDARY LINE: "Kompleksowy marketing od jednej agencji"')
  })

  it('secondary line gets size guidance (55–65%)', () => {
    const prompt = makePrompt({ headline: 'Bold Statement\nSmaller supporting line here' })
    contains(prompt, '55–65% of the primary')
  })

  it('primary line gets "large, heavy, bold" weight guidance', () => {
    const prompt = makePrompt({ headline: 'Bold Statement\nSmaller supporting line here' })
    contains(prompt, 'large, heavy, bold')
  })

  it('single-part headline renders without TYPOGRAPHIC HIERARCHY block', () => {
    const prompt = makePrompt({ headline: 'Single Line Only' })
    notContains(prompt, 'TYPOGRAPHIC HIERARCHY')
    contains(prompt, '"Single Line Only"')
  })

  it('trims whitespace around headline parts', () => {
    const prompt = makePrompt({ headline: '  Trimmed Primary  \n  Trimmed Secondary  ' })
    contains(prompt, 'PRIMARY HEADLINE: "Trimmed Primary"')
    contains(prompt, 'SECONDARY LINE: "Trimmed Secondary"')
  })

  it('blank second part after \\n falls back to single-line mode', () => {
    const prompt = makePrompt({ headline: 'Only Primary\n   ' })
    notContains(prompt, 'TYPOGRAPHIC HIERARCHY')
    contains(prompt, '"Only Primary"')
  })
})

// ─── Brand DNA ────────────────────────────────────────────────────────────────

describe('brand DNA in prompt', () => {
  it('includes primary brand color', () => {
    contains(makePrompt(), '#1a1a2e')
  })

  it('includes CTA color', () => {
    contains(makePrompt(), '#e94560')
  })

  it('includes brand name in consistency mandate', () => {
    contains(makePrompt(), 'Verseo')
  })

  it('uses exact font names when headingFont provided', () => {
    const prompt = makePrompt({ brand: { ...BASE_BRAND, headingFont: 'Inter', bodyFont: 'Inter' } })
    contains(prompt, 'Inter')
    contains(prompt, 'EXACT FONTS from the website')
  })

  it('uses font style description when no exact fonts', () => {
    const prompt = makePrompt({ brand: { ...BASE_BRAND, headingFont: undefined, bodyFont: undefined } })
    contains(prompt, 'modern geometric sans-serif')
  })

  it('includes USP / key message', () => {
    contains(makePrompt(), 'Kompleksowy marketing cyfrowy od jednej agencji')
  })

  it('includes target audience', () => {
    contains(makePrompt(), 'SME business owners')
  })

  it('includes competitive insight section when provided', () => {
    const prompt = makePrompt({ compInsight: 'Competitors focus on single-channel' })
    contains(prompt, 'COMPETITIVE CONTEXT')
    contains(prompt, 'Competitors focus on single-channel')
  })

  it('omits competitive context when compInsight is null', () => {
    notContains(makePrompt({ compInsight: null }), 'COMPETITIVE CONTEXT')
  })

  it('includes additional notes when provided', () => {
    const prompt = makePrompt({ notes: 'Use autumnal color palette' })
    contains(prompt, 'ADDITIONAL CREATIVE NOTES')
    contains(prompt, 'Use autumnal color palette')
  })
})

// ─── Product image handling ───────────────────────────────────────────────────

describe('product image handling', () => {
  it('shows no-product-image note when hasProductImage is false', () => {
    // Use variant 1 (Product w scenie) which has the note
    const prompt = makePrompt({ hasProductImage: false, variantIndex: 1 })
    contains(prompt, 'No specific product image was provided')
  })

  it('does NOT show no-product-image note when hasProductImage is true', () => {
    const prompt = makePrompt({ hasProductImage: true, variantIndex: 1 })
    notContains(prompt, 'No specific product image was provided')
  })
})

// ─── Meta Stories (9:16 channel=meta) ────────────────────────────────────────

describe('Meta Stories (9:16 + meta channel)', () => {
  function storiesPrompt(overrides = {}) {
    return buildPrompt({
      format:           FMT_9_16_META,
      variantIndex:     0,
      brand:            BASE_BRAND,
      headline:         'Zacznij rosnąć\nKompleksowy marketing',
      cta:              'Sprawdź',
      hasProductImage:  false,
      compInsight:      null,
      notes:            null,
      modelInfo:        MODEL_NB2_9_16,
      campaignChannels: ['Meta Ads'],
      ...overrides,
    })
  }

  it('uses Stories/Reels channel requirements', () => {
    contains(storiesPrompt(), 'Stories / Reels')
  })

  it('explicitly forbids CTA button in the image', () => {
    contains(storiesPrompt(), 'NO CTA button anywhere in the image')
  })

  it('forbids rendering any social platform UI', () => {
    contains(storiesPrompt(), 'DO NOT render any social platform UI')
  })

  it('negative prompt includes Instagram Stories UI overlay', () => {
    contains(storiesPrompt(), 'Instagram Stories UI overlay')
  })

  it('negative prompt includes profile avatar circle', () => {
    contains(storiesPrompt(), 'profile avatar circle')
  })

  it('negative prompt includes story progress bar', () => {
    contains(storiesPrompt(), 'story progress bar')
  })

  it('negative prompt includes swipe up indicator', () => {
    contains(storiesPrompt(), 'swipe up indicator')
  })

  it('CTA button line is NOT rendered in ad copy block for Stories', () => {
    notContains(storiesPrompt(), 'CTA button: "Sprawdź"')
  })
})

// ─── Meta Feed (1:1 meta, not Stories) ───────────────────────────────────────

describe('Meta Feed (non-Stories)', () => {
  it('includes CTA button in ad copy block', () => {
    const prompt = buildPrompt({
      format:           FMT_1_1_META,
      variantIndex:     0,
      brand:            BASE_BRAND,
      headline:         'Primary\nSecondary',
      cta:              'Sprawdź ofertę',
      hasProductImage:  false,
      compInsight:      null,
      notes:            null,
      modelInfo:        MODEL_NB2,
      campaignChannels: ['Meta Ads'],
    })
    contains(prompt, 'CTA button: "Sprawdź ofertę"')
  })

  it('does NOT include Stories restrictions', () => {
    const prompt = buildPrompt({
      format:           FMT_1_1_META,
      variantIndex:     0,
      brand:            BASE_BRAND,
      headline:         'Primary\nSecondary',
      cta:              'Kup',
      hasProductImage:  false,
      compInsight:      null,
      notes:            null,
      modelInfo:        MODEL_NB2,
      campaignChannels: ['Meta Ads'],
    })
    notContains(prompt, 'NO CTA button anywhere in the image')
  })
})

// ─── GDN channel ─────────────────────────────────────────────────────────────

describe('GDN channel requirements', () => {
  it('includes Google Display Ads section', () => {
    contains(makePrompt({ campaignChannels: ['Google Display'] }), 'Google Display Ads')
  })

  it('includes GDN 20% text coverage limit', () => {
    contains(makePrompt(), 'one fifth of the total image surface')
  })
})

// ─── Color mandate ────────────────────────────────────────────────────────────

describe('color mandate', () => {
  it('includes COLOR MANDATE — NON-NEGOTIABLE block', () => {
    contains(makePrompt(), 'COLOR MANDATE — NON-NEGOTIABLE')
  })

  it('includes primary brand color hex in COLOR SYSTEM', () => {
    contains(makePrompt(), '#1a1a2e')
  })

  it('includes full colorPalette block when brand.colorPalette is provided', () => {
    const prompt = makePrompt({
      brand: {
        ...BASE_BRAND,
        colorPalette: [
          { hex: '#1a1a2e', role: 'tło strony' },
          { hex: '#e94560', role: 'przyciski CTA' },
        ],
      },
    })
    contains(prompt, 'FULL COLOR PALETTE')
    contains(prompt, '#1a1a2e → tło strony')
    contains(prompt, '#e94560 → przyciski CTA')
  })

  it('includes compositionStyle when provided', () => {
    const prompt = makePrompt({ brand: { ...BASE_BRAND, compositionStyle: 'centrowany produkt na białym tle' } })
    contains(prompt, 'centrowany produkt na białym tle')
  })

  it('includes imageryType when provided', () => {
    const prompt = makePrompt({ brand: { ...BASE_BRAND, imageryType: 'studio product photography' } })
    contains(prompt, 'studio product photography')
  })

  it('includes lightingMood when provided', () => {
    const prompt = makePrompt({ brand: { ...BASE_BRAND, lightingMood: 'bright airy high-key' } })
    contains(prompt, 'bright airy high-key')
  })

  it('Typograficzny Bold variant includes COLOR-CRITICAL note with primary hex', () => {
    const prompt = makePrompt({ variantIndex: 5 })
    contains(prompt, 'COLOR-CRITICAL')
    contains(prompt, '#1a1a2e')
  })

  it('Gradient Premium variant includes COLOR-CRITICAL gradient note', () => {
    const prompt = makePrompt({ variantIndex: 6 })
    contains(prompt, 'COLOR-CRITICAL')
    contains(prompt, '#1a1a2e → #16213e')
  })
})

// ─── Modern editorial mandate ─────────────────────────────────────────────────

describe('modern editorial mandate', () => {
  it('includes non-negotiable editorial aesthetic block', () => {
    contains(makePrompt(), 'MODERN EDITORIAL AESTHETIC — NON-NEGOTIABLE')
  })

  it('forbids text-only compositions', () => {
    const prompt = makePrompt()
    contains(prompt, 'text-only composition')
    contains(prompt, 'STRICTLY FORBIDDEN')
  })

  it('requires imagery to occupy at least 60% of canvas', () => {
    contains(makePrompt(), '60% of the canvas')
  })

  it('negative prompt bans flat-color-only aesthetics', () => {
    contains(makePrompt(), 'flat color background with only text')
  })
})

// ─── COMPOSITION CONSTRAINT for non-native AR ────────────────────────────────

describe('canvas crop zone (non-native AR)', () => {
  it('includes COMPOSITION CONSTRAINT when needsResize is true', () => {
    const prompt = buildPrompt({
      format:           { ar: '6:5', width: 300, height: 250, channel: 'gdn' },
      variantIndex:     0,
      brand:            BASE_BRAND,
      headline:         'Test Headline',
      cta:              'Kliknij',
      hasProductImage:  false,
      compInsight:      null,
      notes:            null,
      modelInfo:        MODEL_NBPRO_RESIZE,
      campaignChannels: ['Google Display'],
    })
    contains(prompt, 'COMPOSITION CONSTRAINT')
  })

  it('does NOT include COMPOSITION CONSTRAINT for native AR (needsResize false)', () => {
    notContains(makePrompt({ modelInfo: MODEL_NB2 }), 'COMPOSITION CONSTRAINT')
  })
})

// ─── Variant cycling ──────────────────────────────────────────────────────────

describe('variant cycling', () => {
  it('variantIndex 0 → VARIANT 1 (Hero lifestyle)', () => {
    contains(makePrompt({ variantIndex: 0 }), 'VARIANT 1 (Hero lifestyle)')
  })

  it('variantIndex 4 → VARIANT 5 (Minimalist éditorial)', () => {
    contains(makePrompt({ variantIndex: 4 }), 'VARIANT 5 (Minimalist éditorial)')
  })

  it('variantIndex 5 → VARIANT 6 (Typograficzny Bold)', () => {
    contains(makePrompt({ variantIndex: 5 }), 'VARIANT 6 (Typograficzny Bold)')
  })

  it('variantIndex 6 → VARIANT 7 (Gradient Premium)', () => {
    contains(makePrompt({ variantIndex: 6 }), 'VARIANT 7 (Gradient Premium)')
  })

  it('variantIndex 7 → VARIANT 8 (Social Proof)', () => {
    contains(makePrompt({ variantIndex: 7 }), 'VARIANT 8 (Social Proof)')
  })

  it('variantIndex 8 → VARIANT 9 (UGC / Authentic)', () => {
    contains(makePrompt({ variantIndex: 8 }), 'VARIANT 9 (UGC / Authentic)')
  })

  it('variantIndex 9 → VARIANT 10 (Z wzoru referencyjnego)', () => {
    contains(makePrompt({ variantIndex: 9 }), 'VARIANT 10 (Z wzoru referencyjnego)')
  })

  it('variantIndex 10 wraps to VARIANT 11 (Hero lifestyle)', () => {
    contains(makePrompt({ variantIndex: 10 }), 'VARIANT 11 (Hero lifestyle)')
  })
})

// ─── Output format block ──────────────────────────────────────────────────────

describe('output format block', () => {
  it('includes the correct aspect ratio', () => {
    contains(makePrompt({ format: FMT_1_1_GDN }), 'Aspect ratio: 1:1')
  })

  it('bans measurement annotation labels', () => {
    contains(makePrompt(), 'Do NOT draw any measurement labels')
  })

  it('requires the image to look like a real published ad', () => {
    contains(makePrompt(), 'NEVER like a design spec sheet')
  })

  it('negative prompt bans ruler overlays', () => {
    contains(makePrompt(), 'ruler overlays')
  })

  it('negative prompt bans crop marks', () => {
    contains(makePrompt(), 'crop marks')
  })
})

// ─── Goal directives ─────────────────────────────────────────────────────────

describe('goal directives', () => {
  it('Conversion goal includes CONVERSION / SALES block', () => {
    contains(
      makePrompt({ brand: { ...BASE_BRAND, campaignGoal: 'Conversion (Sprzedaż)' } }),
      'CAMPAIGN GOAL — CONVERSION / SALES'
    )
  })

  it('Awareness goal includes BRAND AWARENESS block', () => {
    contains(
      makePrompt({ brand: { ...BASE_BRAND, campaignGoal: 'Awareness (Świadomość marki)' } }),
      'CAMPAIGN GOAL — BRAND AWARENESS'
    )
  })

  it('Consideration goal includes CONSIDERATION / TRAFFIC block', () => {
    contains(
      makePrompt({ brand: { ...BASE_BRAND, campaignGoal: 'Consideration (Ruch / Zaangażowanie)' } }),
      'CAMPAIGN GOAL — CONSIDERATION / TRAFFIC'
    )
  })

  it('Retargeting goal includes RETARGETING block', () => {
    contains(
      makePrompt({ brand: { ...BASE_BRAND, campaignGoal: 'Retargeting' } }),
      'CAMPAIGN GOAL — RETARGETING'
    )
  })

  it('unknown goal falls back to Conversion directive', () => {
    contains(
      makePrompt({ brand: { ...BASE_BRAND, campaignGoal: 'Undefined Goal XYZ' } }),
      'CAMPAIGN GOAL — CONVERSION / SALES'
    )
  })
})
