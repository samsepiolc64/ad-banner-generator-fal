/**
 * extractAdCopy.js
 *
 * Extracts headline and/or CTA overrides from free-form notes text.
 * Supports common Polish and English patterns.
 *
 * Returns:
 *   { headline: string|null, cta: string|null, cleanedNotes: string|null }
 *
 * Extracted values are removed from cleanedNotes to avoid duplication in the prompt.
 */

/** Unwrap common quote characters from a string. */
function unquote(str) {
  return str.replace(/^["„""«»'`]+|["„""«»'`]+$/g, '').trim()
}

// ─── Headline patterns ────────────────────────────────────────────────────────
// Ordered from most specific to least specific.
const HEADLINE_PATTERNS = [
  // "hasło: X" / "nagłówek: X" / "headline: X" / "tytuł: X" / "slogan: X"
  /^[ \t]*(?:hasło|nagłówek|headline|tytuł|slogan)\s*[:：]\s*(.+?)\s*$/im,

  // "użyj hasła: X" / "użyj nagłówka X"
  /użyj\s+(?:hasła|nagłówka|tytułu|sloganu)\s*[:：]?\s*(.+?)\s*$/im,

  // "hasło powinno być X" / "nagłówek to X" / "hasło brzmi X"
  /(?:hasło|nagłówek|tytuł)\s+(?:powinno?\s+być|to\s+jest|to|brzmi)\s*[:：]?\s*(.+?)\s*$/im,

  // "napisz jako hasło: X"
  /napisz\s+(?:jako\s+)?(?:hasło|nagłówek)\s*[:：]?\s*(.+?)\s*$/im,
]

// ─── CTA patterns ─────────────────────────────────────────────────────────────
const CTA_PATTERNS = [
  // "CTA: X" / "przycisk: X"
  /^[ \t]*(?:CTA|przycisk|wezwanie\s+do\s+dzia[łl]ania|call[\s-]to[\s-]action)\s*[:：]\s*(.+?)\s*$/im,

  // "użyj CTA: X" / "użyj przycisku X"
  /użyj\s+(?:CTA|przycisku|wezwania)\s*[:：]?\s*(.+?)\s*$/im,

  // "przycisk powinien być X" / "CTA to X"
  /(?:przycisk|CTA)\s+(?:powinien?\s+być|to\s+jest|to|brzmi)\s*[:：]?\s*(.+?)\s*$/im,
]

/**
 * @param {string|null} notes
 * @returns {{ headline: string|null, cta: string|null, cleanedNotes: string|null }}
 */
export function extractAdCopy(notes) {
  if (!notes?.trim()) return { headline: null, cta: null, cleanedNotes: notes }

  let text = notes
  let headline = null
  let cta = null

  for (const re of HEADLINE_PATTERNS) {
    const m = text.match(re)
    if (m) {
      headline = unquote(m[1])
      text = text.replace(m[0], '').trim()
      break
    }
  }

  for (const re of CTA_PATTERNS) {
    const m = text.match(re)
    if (m) {
      cta = unquote(m[1])
      text = text.replace(m[0], '').trim()
      break
    }
  }

  return {
    headline: headline || null,
    cta: cta || null,
    cleanedNotes: text || null,
  }
}
