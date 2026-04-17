/**
 * Netlify Function: Check fal.ai queue status and fetch result.
 * Uses status_url and response_url returned by the submit step.
 */

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    const { status_url, response_url, falMode } = await req.json()

    const FAL_API_KEY = falMode === 'prod'
      ? (process.env.FAL_PROD_API_KEY || process.env.FAL_API_KEY)
      : process.env.FAL_API_KEY

    if (!FAL_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'FAL_API_KEY not configured.' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }

    if (!status_url || !response_url) {
      return new Response(
        JSON.stringify({ error: 'Missing status_url or response_url' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Check status (GET)
    const statusRes = await fetch(status_url, {
      method: 'GET',
      headers: { 'Authorization': `Key ${FAL_API_KEY}` },
    })

    if (!statusRes.ok) {
      const errText = await statusRes.text().catch(() => '')
      return new Response(
        JSON.stringify({ error: `Status check failed: HTTP ${statusRes.status} — ${errText.slice(0, 300)}` }),
        { status: 502, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const statusData = await statusRes.json()

    // Not done yet — return status
    if (statusData.status !== 'COMPLETED') {
      return new Response(
        JSON.stringify({ status: statusData.status, queue_position: statusData.queue_position }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Completed — fetch the result (GET)
    const resultRes = await fetch(response_url, {
      method: 'GET',
      headers: { 'Authorization': `Key ${FAL_API_KEY}` },
    })

    if (!resultRes.ok) {
      const errText = await resultRes.text().catch(() => '')
      return new Response(
        JSON.stringify({ error: `Result fetch failed: HTTP ${resultRes.status} — ${errText.slice(0, 300)}` }),
        { status: 502, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const data = await resultRes.json()
    const imageUrl = data.images?.[0]?.url

    if (!imageUrl) {
      return new Response(
        JSON.stringify({ error: 'No image URL in fal.ai response', raw: JSON.stringify(data).slice(0, 500) }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ status: 'COMPLETED', imageUrl }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}

export const config = {
  path: '/.netlify/functions/check-result',
}
