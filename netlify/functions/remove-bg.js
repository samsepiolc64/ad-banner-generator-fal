/**
 * Netlify Function: AI background removal via fal.ai Birefnet.
 *
 * Takes a base64 data URL (from the client) and returns a URL to the
 * background-removed PNG with transparency.
 *
 * Used as a fallback when client-side flood-fill can't handle the logo
 * (e.g., logo on a photograph or complex gradient background).
 */

const FAL_ENDPOINT = 'https://queue.fal.run/fal-ai/birefnet/v2'

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const FAL_API_KEY = process.env.FAL_KEY || process.env.FAL_API_KEY

  if (!FAL_API_KEY) {
    return new Response(
      JSON.stringify({
        error: 'FAL_KEY not configured',
        message: 'Klucz fal.ai nie jest skonfigurowany.',
      }),
      { status: 501, headers: { 'Content-Type': 'application/json' } }
    )
  }

  try {
    const { imageDataUrl } = await req.json()

    if (!imageDataUrl || !imageDataUrl.startsWith('data:image')) {
      return new Response(
        JSON.stringify({ error: 'Missing or invalid imageDataUrl' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Submit to fal.ai queue
    const submitRes = await fetch(FAL_ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': `Key ${FAL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        image_url: imageDataUrl,
      }),
    })

    if (!submitRes.ok) {
      const errText = await submitRes.text().catch(() => '')
      return new Response(
        JSON.stringify({ error: `fal.ai submit error: HTTP ${submitRes.status} — ${errText.slice(0, 200)}` }),
        { status: 502, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const submitData = await submitRes.json()
    const { status_url, response_url } = submitData

    if (!status_url || !response_url) {
      return new Response(
        JSON.stringify({ error: 'No queue URLs from fal.ai', raw: submitData }),
        { status: 502, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Poll for completion (bg removal is usually fast — 3-8s)
    const MAX_POLLS = 15
    const POLL_INTERVAL = 1500

    for (let i = 0; i < MAX_POLLS; i++) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL))

      const statusRes = await fetch(status_url, {
        headers: { 'Authorization': `Key ${FAL_API_KEY}` },
      })

      if (!statusRes.ok) continue
      const statusData = await statusRes.json()

      if (statusData.status === 'COMPLETED') {
        const resultRes = await fetch(response_url, {
          headers: { 'Authorization': `Key ${FAL_API_KEY}` },
        })
        const result = await resultRes.json()
        const imageUrl = result.image?.url || result.images?.[0]?.url

        if (!imageUrl) {
          return new Response(
            JSON.stringify({ error: 'No image in fal.ai response', raw: result }),
            { status: 502, headers: { 'Content-Type': 'application/json' } }
          )
        }

        return new Response(
          JSON.stringify({ imageUrl }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      }

      if (statusData.status === 'FAILED') {
        return new Response(
          JSON.stringify({ error: 'fal.ai bg-removal failed', raw: statusData }),
          { status: 502, headers: { 'Content-Type': 'application/json' } }
        )
      }
    }

    return new Response(
      JSON.stringify({ error: 'Timeout — fal.ai did not respond in time' }),
      { status: 504, headers: { 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}

export const config = {
  path: '/.netlify/functions/remove-bg',
}
