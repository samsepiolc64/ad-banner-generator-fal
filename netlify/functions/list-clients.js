/**
 * Netlify Function: List all clients from Supabase brand_research table.
 *
 * Returns all entries sorted by updated_at DESC.
 * If Supabase is not configured, returns { clients: [] }.
 */

async function getSupabase() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) return null
  try {
    const mod = await import('@supabase/supabase-js')
    const createClient = mod.createClient || mod.default?.createClient
    if (!createClient) {
      console.warn('Supabase: createClient not found in module exports')
      return null
    }
    return createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  } catch (e) {
    console.warn('Supabase: failed to load @supabase/supabase-js —', e.message)
    return null
  }
}

export default async (req) => {
  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    const supabase = await getSupabase()

    if (!supabase) {
      return new Response(JSON.stringify({ clients: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const { data, error } = await supabase
      .from('brand_research')
      .select('domain, brand_data, updated_at, fetched, cost_usd, cost_count, cost_last_at')
      .order('updated_at', { ascending: false })

    if (error) {
      console.warn('Supabase list error:', error.message)
      return new Response(JSON.stringify({ clients: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ clients: data || [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('list-clients fatal error:', err)
    return new Response(
      JSON.stringify({ clients: [], error: err.message }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  }
}

export const config = {
  path: '/.netlify/functions/list-clients',
}
