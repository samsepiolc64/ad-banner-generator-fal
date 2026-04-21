import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { resolveModel, closestNBProAR, costPerImage, estimateCost } from './modelRouting.js'

const NB2_NATIVE_ARS = ['21:9', '16:9', '3:2', '4:3', '5:4', '1:1', '4:5', '3:4', '2:3', '9:16']

describe('resolveModel', () => {
  // All NB2-native aspect ratios → type nb2, no resize
  for (const ar of NB2_NATIVE_ARS) {
    it(`native AR ${ar} → nb2, needsResize false`, () => {
      const result = resolveModel({ ar, width: 100, height: 100 })
      assert.equal(result.type, 'nb2')
      assert.equal(result.ar, ar)
      assert.equal(result.needsResize, false)
    })
  }

  it('non-native AR → nbpro, needsResize true', () => {
    const result = resolveModel({ ar: '6:5', width: 300, height: 250 })
    assert.equal(result.type, 'nbpro')
    assert.equal(result.needsResize, true)
    assert.ok(/^\d+:\d+$/.test(result.ar), `Expected AR string like "N:M", got "${result.ar}"`)
  })

  it('1:1 square → nb2, no resize', () => {
    const result = resolveModel({ ar: '1:1', width: 300, height: 300 })
    assert.equal(result.type, 'nb2')
    assert.equal(result.needsResize, false)
  })

  it('9:16 portrait → nb2, no resize', () => {
    const result = resolveModel({ ar: '9:16', width: 1080, height: 1920 })
    assert.equal(result.type, 'nb2')
    assert.equal(result.needsResize, false)
  })
})

describe('closestNBProAR', () => {
  it('exact 1:1 → returns 1:1', () => {
    assert.equal(closestNBProAR(100, 100), '1:1')
  })

  it('exact 16:9 → returns 16:9', () => {
    assert.equal(closestNBProAR(1920, 1080), '16:9')
  })

  it('exact 9:16 → returns 9:16', () => {
    assert.equal(closestNBProAR(1080, 1920), '9:16')
  })

  it('300×250 (ratio 1.2) → closest is 5:4 (ratio 1.25)', () => {
    assert.equal(closestNBProAR(300, 250), '5:4')
  })

  it('very wide 728×90 → closest is 21:9', () => {
    assert.equal(closestNBProAR(728, 90), '21:9')
  })

  it('returns a valid "N:M" formatted string for any input', () => {
    const result = closestNBProAR(640, 480)
    assert.ok(/^\d+:\d+$/.test(result), `Expected "N:M" format, got "${result}"`)
  })
})

describe('costPerImage', () => {
  it('nb2 costs $0.08', () => {
    assert.equal(costPerImage('nb2'), 0.08)
  })

  it('nbpro costs $0.15', () => {
    assert.equal(costPerImage('nbpro'), 0.15)
  })
})

describe('estimateCost', () => {
  it('empty array → $0', () => {
    assert.equal(estimateCost([]), 0)
  })

  it('single native 1:1 → $0.08', () => {
    const cost = estimateCost([{ ar: '1:1', width: 300, height: 300 }])
    assert.ok(Math.abs(cost - 0.08) < 0.001, `Expected ~0.08, got ${cost}`)
  })

  it('single non-native 300×250 → $0.15', () => {
    const cost = estimateCost([{ ar: '6:5', width: 300, height: 250 }])
    assert.ok(Math.abs(cost - 0.15) < 0.001, `Expected ~0.15, got ${cost}`)
  })

  it('two native formats → $0.16', () => {
    const formats = [
      { ar: '1:1', width: 300, height: 300 },
      { ar: '16:9', width: 1920, height: 1080 },
    ]
    const cost = estimateCost(formats)
    assert.ok(Math.abs(cost - 0.16) < 0.001, `Expected ~0.16, got ${cost}`)
  })

  it('mix of native + non-native → $0.23', () => {
    const formats = [
      { ar: '1:1', width: 300, height: 300 },    // $0.08
      { ar: '6:5', width: 300, height: 250 },    // $0.15
    ]
    const cost = estimateCost(formats)
    assert.ok(Math.abs(cost - 0.23) < 0.001, `Expected ~0.23, got ${cost}`)
  })

  it('three native formats → $0.24', () => {
    const formats = [
      { ar: '1:1', width: 300, height: 300 },
      { ar: '16:9', width: 1920, height: 1080 },
      { ar: '9:16', width: 1080, height: 1920 },
    ]
    const cost = estimateCost(formats)
    assert.ok(Math.abs(cost - 0.24) < 0.001, `Expected ~0.24, got ${cost}`)
  })
})
