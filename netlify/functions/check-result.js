/**
 * Netlify Function: Check fal.ai queue status and fetch result.
 * Called by the client every few seconds to poll for completion.
 *
 * Status endpoint:  https://queue.fal.run/fal-ai/{model}/requests/{id}/status
 * Result endpoint:  https://queue.fal.run/fal-ai/{model}/requests/{id}
 */

const MODEL_PATHS = {
  nb2: 'fal-ai/nano-banana-2',
  nbpro: 'fal-ai/nano-banana-pro',
}

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const FAL_API_KEY = process.env.FAL_API_KEY
  if (!FAL_API_KEY) {
    return new Response(
      JSON.stringify({ error: 'FAL_API_KEY not configured.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }

  try {
    const { request_id, modelType, useLogo } = await req.json()

    if (!request_id || !modelType) {
      return new Response(
        JSON.stringify({ error: 'Missing request_id or modelType' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const modelPath = MODEL_PATHS[modelType] || MODEL_PATHS.nbpro
    const editSuffix = useLogo ? '/edit' : ''
    const baseUrl = `https://queue.fal.run/${modelPath}${editSuffix}/requests/${request_id}`

    // First check status
    const statusRes = await fetch(`${baseUrl}/status`, {
      headers: { 'Authorization': `Key ${FAL_API_KEY}` },
    })

    if (!statusRes.ok) {
      const errText = await statusRes.text().catch(() => '')
      return new Response(
        JSON.stringify({ error: `Status check failed: HTTP ${statusRes.status} — ${errText.slice(0, 300)}` }),
        { status: statusRes.status, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const statusData = await statusRes.json()

    // If not completed yet, return status only
    if (statusData.status !== 'COMPLETED') {
      return new Response(
        JSON.stringify({ status: statusData.status, queue_position: statusData.queue_position }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Completed — fetch the actual result
    const resultRes = await fetch(baseUrl, {
      headers: { 'Authorization': `Key ${FAL_API_KEY}` },
    })

    if (!resultRes.ok) {
      const errText = await resultRes.text().catch(() => '')
      return new Response(
        JSON.stringify({ error: `Result fetch failed: HTTP ${resultRes.status} — ${errText.slice(0, 300)}` }),
        { status: resultRes.status, headers: { 'Content-Type': 'application/json' } }
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
