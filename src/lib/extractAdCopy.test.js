import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { extractAdCopy } from './extractAdCopy.js'

describe('extractAdCopy', () => {
  // ── null / empty ───────────────────────────────────────────────────────────
  it('returns nulls for null input', () => {
    const r = extractAdCopy(null)
    assert.equal(r.headline, null)
    assert.equal(r.cta, null)
  })

  it('returns nulls for empty string', () => {
    const r = extractAdCopy('')
    assert.equal(r.headline, null)
    assert.equal(r.cta, null)
  })

  it('returns nulls when no patterns match', () => {
    const r = extractAdCopy('Zrób grafikę w stylu Apple, bez ludzi.')
    assert.equal(r.headline, null)
    assert.equal(r.cta, null)
    assert.equal(r.cleanedNotes, 'Zrób grafikę w stylu Apple, bez ludzi.')
  })

  // ── headline extraction ────────────────────────────────────────────────────
  it('extracts headline with "hasło: X"', () => {
    const r = extractAdCopy('hasło: Odkryj nowy smak')
    assert.equal(r.headline, 'Odkryj nowy smak')
    assert.equal(r.cta, null)
  })

  it('extracts headline case-insensitively (HASŁO)', () => {
    const r = extractAdCopy('HASŁO: Smak który zmienia wszystko')
    assert.equal(r.headline, 'Smak który zmienia wszystko')
  })

  it('extracts headline with "nagłówek: X"', () => {
    const r = extractAdCopy('nagłówek: Twój idealny wybór')
    assert.equal(r.headline, 'Twój idealny wybór')
  })

  it('extracts headline with "headline: X" (English)', () => {
    const r = extractAdCopy('headline: Taste the difference')
    assert.equal(r.headline, 'Taste the difference')
  })

  it('extracts headline with "slogan: X"', () => {
    const r = extractAdCopy('slogan: Jakość bez kompromisów')
    assert.equal(r.headline, 'Jakość bez kompromisów')
  })

  it('extracts headline with "użyj hasła: X"', () => {
    const r = extractAdCopy('użyj hasła: Lato pełne smaków')
    assert.equal(r.headline, 'Lato pełne smaków')
  })

  it('extracts headline with "nagłówek to X"', () => {
    const r = extractAdCopy('nagłówek to Świeżość na co dzień')
    assert.equal(r.headline, 'Świeżość na co dzień')
  })

  it('strips quotes from headline', () => {
    const r = extractAdCopy('hasło: „Odkryj nowy smak"')
    assert.equal(r.headline, 'Odkryj nowy smak')
  })

  it('strips double quotes from headline', () => {
    const r = extractAdCopy('hasło: "Taste the difference"')
    assert.equal(r.headline, 'Taste the difference')
  })

  // ── CTA extraction ─────────────────────────────────────────────────────────
  it('extracts CTA with "CTA: X"', () => {
    const r = extractAdCopy('CTA: Zamów teraz')
    assert.equal(r.cta, 'Zamów teraz')
    assert.equal(r.headline, null)
  })

  it('extracts CTA with "przycisk: X"', () => {
    const r = extractAdCopy('przycisk: Sprawdź ofertę')
    assert.equal(r.cta, 'Sprawdź ofertę')
  })

  it('extracts CTA with "użyj CTA: X"', () => {
    const r = extractAdCopy('użyj CTA: Kup teraz')
    assert.equal(r.cta, 'Kup teraz')
  })

  it('extracts CTA with "przycisk powinien być X"', () => {
    const r = extractAdCopy('przycisk powinien być Dowiedz się więcej')
    assert.equal(r.cta, 'Dowiedz się więcej')
  })

  // ── both headline + CTA ────────────────────────────────────────────────────
  it('extracts both headline and CTA from multiline notes', () => {
    const notes = 'hasło: Odkryj świat smaków\nCTA: Zamów teraz\nStyl jak Apple.'
    const r = extractAdCopy(notes)
    assert.equal(r.headline, 'Odkryj świat smaków')
    assert.equal(r.cta, 'Zamów teraz')
    assert.equal(r.cleanedNotes, 'Styl jak Apple.')
  })

  it('removes extracted parts from cleanedNotes', () => {
    const notes = 'Styl minimalistyczny.\nhasło: Jakość na pierwszym miejscu\nUnikaj czerwieni.'
    const r = extractAdCopy(notes)
    assert.equal(r.headline, 'Jakość na pierwszym miejscu')
    assert.ok(!r.cleanedNotes.includes('hasło:'))
    assert.ok(r.cleanedNotes.includes('Styl minimalistyczny'))
    assert.ok(r.cleanedNotes.includes('Unikaj czerwieni'))
  })

  it('returns null cleanedNotes when only ad copy in notes', () => {
    const r = extractAdCopy('hasło: Tylko to\nCTA: Kliknij')
    assert.equal(r.cleanedNotes, null)
  })
})
