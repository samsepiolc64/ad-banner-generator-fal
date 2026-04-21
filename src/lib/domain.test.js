import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeDomain, firstLetter } from './domain.js'

describe('normalizeDomain', () => {
  it('strips https:// prefix', () => {
    assert.equal(normalizeDomain('https://example.com'), 'example.com')
  })

  it('strips http:// prefix', () => {
    assert.equal(normalizeDomain('http://example.com'), 'example.com')
  })

  it('strips www. prefix', () => {
    assert.equal(normalizeDomain('www.example.com'), 'example.com')
  })

  it('strips both https:// and www.', () => {
    assert.equal(normalizeDomain('https://www.example.com'), 'example.com')
  })

  it('strips trailing slash', () => {
    assert.equal(normalizeDomain('example.com/'), 'example.com')
  })

  it('strips multiple trailing slashes', () => {
    assert.equal(normalizeDomain('example.com///'), 'example.com')
  })

  it('lowercases the domain', () => {
    assert.equal(normalizeDomain('EXAMPLE.COM'), 'example.com')
  })

  it('handles full URL with https, www, trailing slash', () => {
    assert.equal(normalizeDomain('https://www.Example.PL/'), 'example.pl')
  })

  it('handles null gracefully', () => {
    assert.equal(normalizeDomain(null), '')
  })

  it('handles undefined gracefully', () => {
    assert.equal(normalizeDomain(undefined), '')
  })

  it('handles empty string', () => {
    assert.equal(normalizeDomain(''), '')
  })

  it('trims surrounding whitespace', () => {
    assert.equal(normalizeDomain('  example.com  '), 'example.com')
  })

  it('preserves subdomains other than www', () => {
    assert.equal(normalizeDomain('shop.example.com'), 'shop.example.com')
  })

  it('handles .pl domain with https and www', () => {
    assert.equal(normalizeDomain('https://www.leasingteam.pl/'), 'leasingteam.pl')
  })
})

describe('firstLetter', () => {
  it('returns uppercase first letter of domain', () => {
    assert.equal(firstLetter('example.com'), 'E')
  })

  it('returns uppercase first letter after normalization (strips www)', () => {
    assert.equal(firstLetter('www.amazon.com'), 'A')
  })

  it('returns uppercase first letter from full URL', () => {
    assert.equal(firstLetter('https://verseo.pl'), 'V')
  })

  it('returns # for numeric-start domain', () => {
    assert.equal(firstLetter('123foo.com'), '#')
  })

  it('returns # for empty input', () => {
    assert.equal(firstLetter(''), '#')
  })

  it('returns # for null input', () => {
    assert.equal(firstLetter(null), '#')
  })

  it('uppercases a lowercase first character', () => {
    assert.equal(firstLetter('zalando.pl'), 'Z')
  })
})
