/**
 * Netlify Function: Increment generation cost for a client domain.
 *
 * POST { domain: string, amountUsd: number }
 *
 * Updates brand_research.cost_usd / cost_count / cost_last_at.
 * Uses read-modify-write (acceptable — concurrent cost updates are extremely rare).
 * Fails silently: cost tracking is non-critical, never blocks generation.
 */

async function getSupabase() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) return null
  try {
    const mod = await import('@supabase/supabase-js')
    const createClient = mod.createClient || mod.default?.createClient
    if (!createClient) return null
    return createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  } catch {
    return null
  }
}

function normalizeDomain(domain) {
  return String(domain || '')
    .toLowerCase()
    .trim()
    .replace(/^https?:\/\//, '')
    .replace(/\/+$/, '')
}

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    const { domain, amountUsd } = await req.json()
    if (!domain || !amountUsd || amountUsd <= 0) {
      return new Response(JSON.stringify({ error: 'Missing domain or amountUsd' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const supabase = await getSupabase()
    if (!supabase) {
      return new Response(JSON.stringify({ ok: false, reason: 'no-supabase' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const normalized = normalizeDomain(domain)

    // Read current value
    const { data: current } = await supabase
      .from('brand_research')
      .select('cost_usd, cost_count')
      .eq('domain', normalized)
      .maybeSingle()

    const newTotal = parseFloat(((current?.cost_usd || 0) + amountUsd).toFixed(4))
    const newCount = (current?.cost_count || 0) + 1

    if (current) {
      // Row exists — update only cost fields
      const { error } = await supabase
        .from('brand_research')
        .update({
          cost_usd: newTotal,
          cost_count: newCount,
          cost_last_at: new Date().toISOString(),
        })
        .eq('domain', normalized)

      if (error) console.warn('add-cost update error:', error.message)
    } else {
      // No research row yet — insert cost-only row
      const { error } = await supabase
        .from('brand_research')
        .insert({
          domain: normalized,
          brand_data: null,
          fetched: false,
          cost_usd: newTotal,
          cost_count: newCount,
          cost_last_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })

      if (error) console.warn('add-cost insert error:', error.message)
    }

    return new Response(JSON.stringify({ ok: true, total: newTotal, count: newCount }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('add-cost error:', err)
    return new Response(JSON.stringify({ ok: false, error: err.message }), {
      status: 200, // always 200 — cost tracking must never break generation
      headers: { 'Content-Type': 'application/json' },
    })
  }
}

export const config = {
  path: '/.netlify/functions/add-cost',
}
