/**
 * Netlify Function: Delete a client (domain) from Supabase brand_research table.
 *
 * Body: { domain: string }
 * Returns: { ok: true } or { error: string }
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
  } catch (e) {
    console.warn('Supabase: failed to load —', e.message)
    return null
  }
}

export default async (req) => {
  if (req.method !== 'DELETE') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    const { domain } = await req.json()
    if (!domain) {
      return new Response(JSON.stringify({ error: 'domain required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const supabase = await getSupabase()
    if (!supabase) {
      return new Response(JSON.stringify({ error: 'Supabase not configured' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const { error } = await supabase
      .from('brand_research')
      .delete()
      .eq('domain', domain)

    if (error) {
      console.warn('Supabase delete error:', error.message)
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('delete-client fatal error:', err)
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}

export const config = {
  path: '/.netlify/functions/delete-client',
}
