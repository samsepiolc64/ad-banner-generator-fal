import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  brandNameFromDomain,
  brandMatchesDomain,
  extractJsonObject,
  extractTechnicalHints,
  normalizeDomain,
} from '../netlify/functions/research-domain.js'

// ─── normalizeDomain ──────────────────────────────────────────────────────────

describe('normalizeDomain', () => {
  it('lowercases and trims', () => {
    assert.equal(normalizeDomain('  EXAMPLE.COM  '), 'example.com')
  })

  it('strips https:// prefix', () => {
    assert.equal(normalizeDomain('https://example.com'), 'example.com')
  })

  it('strips http:// prefix', () => {
    assert.equal(normalizeDomain('http://example.com'), 'example.com')
  })

  it('strips trailing slashes', () => {
    assert.equal(normalizeDomain('example.com///'), 'example.com')
  })

  it('preserves www. subdomain (cache key stability)', () => {
    // The local normalizeDomain in research-domain.js intentionally keeps www.
    // so cache keys are stable — this differs from src/lib/domain.js
    assert.equal(normalizeDomain('www.example.com'), 'www.example.com')
  })

  it('handles null', () => {
    assert.equal(normalizeDomain(null), '')
  })

  it('handles undefined', () => {
    assert.equal(normalizeDomain(undefined), '')
  })
})

// ─── brandNameFromDomain ──────────────────────────────────────────────────────

describe('brandNameFromDomain', () => {
  it('title-cases a simple domain', () => {
    assert.equal(brandNameFromDomain('example.com'), 'Example')
  })

  it('preserves hyphenated brand names', () => {
    assert.equal(brandNameFromDomain('x-kom.pl'), 'x-kom')
  })

  it('preserves e- prefix brands', () => {
    assert.equal(brandNameFromDomain('e-obuwie.pl'), 'e-obuwie')
  })

  it('strips https:// and www.', () => {
    assert.equal(brandNameFromDomain('https://www.verseo.pl/'), 'Verseo')
  })

  it('title-cases aleszale.pl correctly', () => {
    assert.equal(brandNameFromDomain('aleszale.pl'), 'Aleszale')
  })

  it('handles domain with path', () => {
    assert.equal(brandNameFromDomain('brand.com/page'), 'Brand')
  })

  it('returns empty string for null', () => {
    assert.equal(brandNameFromDomain(null), '')
  })

  it('returns empty string for empty string', () => {
    assert.equal(brandNameFromDomain(''), '')
  })
})

// ─── brandMatchesDomain ──────────────────────────────────────────────────────

describe('brandMatchesDomain', () => {
  it('matches when brand name contains domain body', () => {
    assert.equal(brandMatchesDomain('Aleszale', 'aleszale.pl'), true)
  })

  it('matches case-insensitively', () => {
    assert.equal(brandMatchesDomain('ALESZALE', 'aleszale.pl'), true)
  })

  it('matches diacritic-stripped names', () => {
    // "Aleszale" without diacritics still matches "aleszale"
    assert.equal(brandMatchesDomain('Alęszale', 'aleszale.pl'), true)
  })

  it('rejects hallucinated split like "Ależ Żale" (space breaks contiguous match)', () => {
    // "ales zale" does NOT include "aleszale" as contiguous substring
    assert.equal(brandMatchesDomain('Ależ Żale', 'aleszale.pl'), false)
  })

  it('rejects completely unrelated brand name', () => {
    assert.equal(brandMatchesDomain('Google', 'aleszale.pl'), false)
  })

  it('matches partial brand names (brand contains domain body)', () => {
    assert.equal(brandMatchesDomain('Verseo Agency', 'verseo.pl'), true)
  })

  it('returns false for null brand', () => {
    assert.equal(brandMatchesDomain(null, 'example.com'), false)
  })

  it('returns false for null domain', () => {
    assert.equal(brandMatchesDomain('Example', null), false)
  })

  it('returns false for short domain body (< 3 chars)', () => {
    assert.equal(brandMatchesDomain('AB', 'ab.pl'), false)
  })
})

// ─── extractJsonObject ────────────────────────────────────────────────────────

describe('extractJsonObject', () => {
  it('extracts a plain JSON object', () => {
    const result = extractJsonObject('{"name":"Verseo"}')
    assert.equal(result, '{"name":"Verseo"}')
  })

  it('extracts JSON preceded by prose', () => {
    const text = 'VISUAL EVIDENCE:\nLogo says Verseo.\n{"name":"Verseo","industry":"SEO"}'
    assert.equal(extractJsonObject(text), '{"name":"Verseo","industry":"SEO"}')
  })

  it('handles stray braces in prose before JSON', () => {
    const text = 'Evidence: {some braces} in text.\n{"name":"Test"}'
    assert.equal(extractJsonObject(text), '{"name":"Test"}')
  })

  it('handles nested objects', () => {
    const text = '{"name":"Foo","colors":{"primary":"#fff"}}'
    assert.equal(extractJsonObject(text), '{"name":"Foo","colors":{"primary":"#fff"}}')
  })

  it('handles braces inside strings', () => {
    const text = '{"name":"Foo {bar}","industry":"test"}'
    assert.equal(extractJsonObject(text), '{"name":"Foo {bar}","industry":"test"}')
  })

  it('returns null for text with no JSON', () => {
    assert.equal(extractJsonObject('no json here'), null)
  })

  it('returns null for null input', () => {
    assert.equal(extractJsonObject(null), null)
  })

  it('returns null for empty string', () => {
    assert.equal(extractJsonObject(''), null)
  })

  it('returns null for unclosed brace', () => {
    assert.equal(extractJsonObject('{"name":"unclosed"'), null)
  })

  it('handles escaped quotes inside strings', () => {
    const text = '{"name":"he said \\"hello\\""}'
    const result = extractJsonObject(text)
    assert.notEqual(result, null)
    const parsed = JSON.parse(result)
    assert.equal(parsed.name, 'he said "hello"')
  })
})

// ─── extractTechnicalHints ────────────────────────────────────────────────────

describe('extractTechnicalHints', () => {
  it('returns null for null input', () => {
    assert.equal(extractTechnicalHints(null), null)
  })

  it('returns null when HTML has no hints', () => {
    assert.equal(extractTechnicalHints('<html><body>hello</body></html>'), null)
  })

  it('extracts Google Fonts family names', () => {
    const html = `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;700&family=Open+Sans&display=swap">`
    const result = extractTechnicalHints(html)
    assert.ok(result, 'expected hints')
    assert.ok(result.includes('Montserrat'), `expected Montserrat, got: ${result}`)
    assert.ok(result.includes('Open Sans'), `expected Open Sans, got: ${result}`)
  })

  it('extracts CSS brand color variables', () => {
    const html = `<style>:root { --primary-color: #ff0000; --accent: #00ff00; }</style>`
    const result = extractTechnicalHints(html)
    assert.ok(result, 'expected hints')
    assert.ok(result.includes('#ff0000'), `expected primary color, got: ${result}`)
  })

  it('extracts CTA/button background colors', () => {
    const html = `<style>.btn-primary { background-color: #3366cc; color: white; }</style>`
    const result = extractTechnicalHints(html)
    assert.ok(result, 'expected hints')
    assert.ok(result.includes('#3366cc'), `expected button color, got: ${result}`)
  })

  it('returns combined hints when multiple sources present', () => {
    const html = `
      <link rel="stylesheet" href="https://fonts.googleapis.com/css?family=Roboto">
      <style>:root { --brand-color: #abcdef; } .cta { background: #112233; }</style>
    `
    const result = extractTechnicalHints(html)
    assert.ok(result, 'expected hints')
    assert.ok(result.includes('Roboto'), `expected Roboto, got: ${result}`)
  })
})
