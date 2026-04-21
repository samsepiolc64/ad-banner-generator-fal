/**
 * Netlify Function: Update client metadata (opiekun, cel_kampanii).
 *
 * PATCH { domain, opiekun?, cel_kampanii? }
 *
 * Updates only the provided fields in brand_research row.
 * If the row doesn't exist yet, inserts a minimal one.
 * Never overwrites brand_data or cost fields.
 */

async function getSupabase() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) return null
  try {
    const mod = await import('@supabase/supabase-js')
    const createClient = mod.createClient || mod.default?.createClient
    if (!createClient) return null
    return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  } catch { return null }
}

function normalizeDomain(domain) {
  return String(domain || '').toLowerCase().trim()
    .replace(/^https?:\/\//, '').replace(/\/+$/, '')
}

export default async (req) => {
  if (req.method !== 'PATCH' && req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    const body = await req.json()
    const { domain, opiekun, cel_kampanii } = body

    if (!domain) {
      return new Response(JSON.stringify({ error: 'Missing domain' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      })
    }

    const supabase = await getSupabase()
    if (!supabase) {
      return new Response(JSON.stringify({ ok: false, reason: 'no-supabase' }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      })
    }

    const normalized = normalizeDomain(domain)

    // Build update object — only include fields that were provided
    const updates = {}
    if (opiekun !== undefined) updates.opiekun = opiekun || null
    if (cel_kampanii !== undefined) updates.cel_kampanii = cel_kampanii || null

    if (Object.keys(updates).length === 0) {
      return new Response(JSON.stringify({ ok: true, message: 'nothing to update' }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      })
    }

    // Check if row exists
    const { data: existing } = await supabase
      .from('brand_research')
      .select('domain')
      .eq('domain', normalized)
      .maybeSingle()

    if (existing) {
      const { error } = await supabase
        .from('brand_research')
        .update(updates)
        .eq('domain', normalized)
      if (error) console.warn('update-client-meta update error:', error.message)
    } else {
      // Insert minimal row with just the meta fields
      const { error } = await supabase
        .from('brand_research')
        .insert({
          domain: normalized,
          brand_data: null,
          fetched: false,
          updated_at: new Date().toISOString(),
          ...updates,
        })
      if (error) console.warn('update-client-meta insert error:', error.message)
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('update-client-meta error:', err)
    return new Response(JSON.stringify({ ok: false, error: err.message }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    })
  }
}

export const config = {
  path: '/.netlify/functions/update-client-meta',
}
