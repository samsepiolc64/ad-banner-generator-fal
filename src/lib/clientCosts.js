/**
 * Per-client cost tracking.
 *
 * addCost: zapisuje do Supabase (przez add-cost function) ORAZ do localStorage
 *          (dla natychmiastowego odczytu w bieżącej sesji bez reload).
 *
 * getCost: czyta z localStorage — używane jako fallback gdy Supabase dane
 *          jeszcze nie dotarły do klienta (np. zaraz po generowaniu).
 */

const KEY = (domain) => `banner_cost_${domain.toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '')}`

/** Dodaj koszt — zapisuje do Supabase (persist) + localStorage (natychmiastowy odczyt) */
export async function addCost(domain, amountUsd) {
  if (!domain || !amountUsd) return

  // 1. Lokalne localStorage — natychmiastowe pojawienie się w UI tej sesji
  try {
    const existing = JSON.parse(localStorage.getItem(KEY(domain)) || '{"total":0,"count":0}')
    const updated = {
      total: parseFloat(((existing.total || 0) + amountUsd).toFixed(4)),
      count: (existing.count || 0) + 1,
      lastAt: new Date().toISOString(),
    }
    localStorage.setItem(KEY(domain), JSON.stringify(updated))
  } catch {}

  // 2. Supabase — persistent, widoczne na wszystkich urządzeniach
  try {
    fetch('/.netlify/functions/add-cost', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ domain, amountUsd }),
    }).catch(() => {}) // fire-and-forget, never throw
  } catch {}
}

/** Odczytaj koszt z localStorage (bieżąca sesja) */
export function getCost(domain) {
  if (!domain) return null
  try {
    const data = JSON.parse(localStorage.getItem(KEY(domain)))
    return data || null
  } catch { return null }
}

export function formatCost(usd) {
  if (!usd && usd !== 0) return null
  return `$${Number(usd).toFixed(2)}`
}
