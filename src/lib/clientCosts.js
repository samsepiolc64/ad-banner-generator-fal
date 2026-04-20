/**
 * Per-client cost tracking via localStorage.
 * Key: `banner_cost_${domain}` → { total: number, count: number, lastAt: ISO string }
 */

const KEY = (domain) => `banner_cost_${domain.toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '')}`

export function addCost(domain, amountUsd) {
  if (!domain || !amountUsd) return
  try {
    const existing = JSON.parse(localStorage.getItem(KEY(domain)) || '{"total":0,"count":0}')
    const updated = {
      total: (existing.total || 0) + amountUsd,
      count: (existing.count || 0) + 1,
      lastAt: new Date().toISOString(),
    }
    localStorage.setItem(KEY(domain), JSON.stringify(updated))
  } catch {}
}

export function getCost(domain) {
  if (!domain) return null
  try {
    const data = JSON.parse(localStorage.getItem(KEY(domain)))
    return data || null
  } catch { return null }
}

export function formatCost(usd) {
  if (!usd && usd !== 0) return null
  return `$${usd.toFixed(2)}`
}
