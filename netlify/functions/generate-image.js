/**
 * Netlify Function: Submit image generation to fal.ai queue.
 * Returns request_id + status_url + response_url immediately.
 */

const ENDPOINTS = {
  nb2: {
    t2i: 'https://queue.fal.run/fal-ai/nano-banana-2',
    edit: 'https://queue.fal.run/fal-ai/nano-banana-2/edit',
  },
  nbpro: {
    t2i: 'https://queue.fal.run/fal-ai/nano-banana-pro',
    edit: 'https://queue.fal.run/fal-ai/nano-banana-pro/edit',
  },
}

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    const body = await req.json()
    const { prompt, ar, modelType, useLogo, logoDataUrl, falMode, seed } = body

    const FAL_API_KEY = falMode === 'prod'
      ? (process.env.FAL_PROD_API_KEY || process.env.FAL_API_KEY)
      : process.env.FAL_API_KEY

    if (!FAL_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'FAL_API_KEY not configured.' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }

    if (!prompt || !ar || !modelType) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: prompt, ar, modelType' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const endpoints = ENDPOINTS[modelType] || ENDPOINTS.nbpro
    const endpoint = useLogo ? endpoints.edit : endpoints.t2i

    // logoDataUrl may be a single string or an array of URLs/data-URLs
    const imageUrls = useLogo
      ? (Array.isArray(logoDataUrl) ? logoDataUrl : [logoDataUrl]).filter(Boolean)
      : []

    const falBody = imageUrls.length > 0
      ? { prompt, aspect_ratio: ar, image_urls: imageUrls, ...(seed != null ? { seed } : {}) }
      : { prompt, aspect_ratio: ar, ...(seed != null ? { seed } : {}) }

    const falRes = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Key ${FAL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(falBody),
    })

    if (!falRes.ok) {
      const errText = await falRes.text().catch(() => '')
      return new Response(
        JSON.stringify({ error: `fal.ai submit error: HTTP ${falRes.status} — ${errText.slice(0, 300)}` }),
        { status: falRes.status, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const data = await falRes.json()

    // Return the URLs that fal.ai gave us — no manual URL construction
    return new Response(
      JSON.stringify({
        request_id: data.request_id,
        status_url: data.status_url,
        response_url: data.response_url,
      }),
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
  path: '/.netlify/functions/generate-image',
}
