import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { loadResearch, saveResearch, clearResearch, formatAge } from './researchCache.js'

// ─── localStorage mock ────────────────────────────────────────────────────────
const store = {}

global.localStorage = {
  getItem:    (key)        => Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null,
  setItem:    (key, value) => { store[key] = String(value) },
  removeItem: (key)        => { delete store[key] },
  clear:      ()           => { Object.keys(store).forEach((k) => delete store[k]) },
}

const BRAND_STUB = {
  name: 'Acme',
  domain: 'acme.pl',
  colors: { primary: '#000', secondary: '#fff', accent: '#f00' },
}

beforeEach(() => {
  global.localStorage.clear()
})

// ─── saveResearch + loadResearch ──────────────────────────────────────────────

describe('saveResearch + loadResearch', () => {
  it('saves and loads a brand entry', () => {
    saveResearch('acme.pl', BRAND_STUB, 'fresh')
    const entry = loadResearch('acme.pl')
    assert.notEqual(entry, null)
    assert.deepEqual(entry.brand, BRAND_STUB)
    assert.equal(entry.fetched, 'fresh')
  })

  it('stores schema version 2', () => {
    saveResearch('acme.pl', BRAND_STUB, 'fresh')
    const entry = loadResearch('acme.pl')
    assert.equal(entry.version, 2)
  })

  it('timestamp is close to now', () => {
    const before = Date.now()
    saveResearch('acme.pl', BRAND_STUB, 'fresh')
    const after = Date.now()
    const entry = loadResearch('acme.pl')
    assert.ok(entry.timestamp >= before, 'timestamp should be >= before')
    assert.ok(entry.timestamp <= after, 'timestamp should be <= after')
  })

  it('normalizes domain — strips https:// and trailing slash (but keeps www.)', () => {
    // researchCache's normalizeKey strips https:// and trailing slash, but NOT www.
    // So https://www.acme.pl/ → key: "www.acme.pl"
    saveResearch('https://www.acme.pl/', BRAND_STUB, 'fresh')
    const entry = loadResearch('https://www.acme.pl/')  // same normalized key
    assert.notEqual(entry, null)
    assert.equal(entry.brand.name, 'Acme')
  })

  it('returns null when nothing cached', () => {
    assert.equal(loadResearch('unknown.pl'), null)
  })

  it('returns null when schema version mismatches', () => {
    store['brand-research:acme.pl'] = JSON.stringify({
      version: 1,
      timestamp: Date.now(),
      brand: BRAND_STUB,
      fetched: 'fresh',
    })
    assert.equal(loadResearch('acme.pl'), null)
  })

  it('returns null when entry is older than 30 days', () => {
    const oldTs = Date.now() - (31 * 24 * 60 * 60 * 1000)
    store['brand-research:acme.pl'] = JSON.stringify({
      version: 2,
      timestamp: oldTs,
      brand: BRAND_STUB,
      fetched: 'fresh',
    })
    assert.equal(loadResearch('acme.pl'), null)
  })

  it('returns entry when within 30 days', () => {
    const recentTs = Date.now() - (29 * 24 * 60 * 60 * 1000)
    store['brand-research:acme.pl'] = JSON.stringify({
      version: 2,
      timestamp: recentTs,
      brand: BRAND_STUB,
      fetched: 'fresh',
    })
    assert.notEqual(loadResearch('acme.pl'), null)
  })

  it('returns null for corrupt JSON in localStorage', () => {
    store['brand-research:acme.pl'] = 'not-json{{{'
    assert.equal(loadResearch('acme.pl'), null)
  })
})

// ─── clearResearch ────────────────────────────────────────────────────────────

describe('clearResearch', () => {
  it('removes a cached entry', () => {
    saveResearch('acme.pl', BRAND_STUB, 'fresh')
    clearResearch('acme.pl')
    assert.equal(loadResearch('acme.pl'), null)
  })

  it('does not throw when clearing a non-existent entry', () => {
    assert.doesNotThrow(() => clearResearch('nonexistent.pl'))
  })

  it('normalizes domain when clearing — same key as save', () => {
    // normalizeKey strips https:// and trailing slash — so these resolve to the same key
    saveResearch('https://acme.pl/', BRAND_STUB, 'fresh')
    clearResearch('https://acme.pl/')    // same key: "acme.pl"
    assert.equal(loadResearch('acme.pl'), null)
  })
})

// ─── formatAge ────────────────────────────────────────────────────────────────

describe('formatAge', () => {
  it('"przed chwilą" for < 1 minute ago', () => {
    assert.equal(formatAge(Date.now() - 30_000), 'przed chwilą')
  })

  it('"minutę temu" for exactly 1 minute ago', () => {
    assert.equal(formatAge(Date.now() - 60_000), 'minutę temu')
  })

  it('"X min temu" for 5 minutes ago', () => {
    assert.equal(formatAge(Date.now() - 5 * 60_000), '5 min temu')
  })

  it('"X min temu" for 30 minutes ago', () => {
    assert.equal(formatAge(Date.now() - 30 * 60_000), '30 min temu')
  })

  it('"godzinę temu" for exactly 1 hour ago', () => {
    assert.equal(formatAge(Date.now() - 60 * 60_000), 'godzinę temu')
  })

  it('"X godz. temu" for 3 hours ago', () => {
    assert.equal(formatAge(Date.now() - 3 * 60 * 60_000), '3 godz. temu')
  })

  it('"X godz. temu" for 23 hours ago', () => {
    assert.equal(formatAge(Date.now() - 23 * 60 * 60_000), '23 godz. temu')
  })

  it('"wczoraj" for exactly 1 day ago', () => {
    assert.equal(formatAge(Date.now() - 24 * 60 * 60_000), 'wczoraj')
  })

  it('"X dni temu" for 2 days ago', () => {
    assert.equal(formatAge(Date.now() - 2 * 24 * 60 * 60_000), '2 dni temu')
  })

  it('"X dni temu" for 15 days ago', () => {
    assert.equal(formatAge(Date.now() - 15 * 24 * 60 * 60_000), '15 dni temu')
  })
})
