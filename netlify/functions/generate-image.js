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
  'gpt-image-2': {
    t2i: 'https://queue.fal.run/fal-ai/gpt-image-2',
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
    const { prompt, ar, width, height, modelType, useLogo, logoDataUrl, falMode, seed } = body

    const FAL_API_KEY = falMode === 'prod'
      ? (process.env.FAL_PROD_API_KEY || process.env.FAL_API_KEY)
      : process.env.FAL_API_KEY

    if (!FAL_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'FAL_API_KEY not configured.' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const isGptImage2 = modelType === 'gpt-image-2'

    if (!prompt || !modelType) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: prompt, modelType' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }
    if (!isGptImage2 && !ar) {
      return new Response(
        JSON.stringify({ error: 'Missing required field: ar (for Nano Banana models)' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }
    if (isGptImage2 && (!width || !height)) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: width, height (for GPT Image 2)' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    let endpoint, falBody

    if (isGptImage2) {
      // GPT Image 2: t2i only, uses image_size { width, height }, no seed, no image_urls
      endpoint = ENDPOINTS['gpt-image-2'].t2i
      falBody = {
        prompt,
        image_size: { width: Number(width), height: Number(height) },
        quality: 'high',
        output_format: 'jpeg',
      }
    } else {
      // Nano Banana 2 / Pro: aspect_ratio + optional image_urls + optional seed
      const endpoints = ENDPOINTS[modelType] || ENDPOINTS.nbpro
      endpoint = useLogo ? endpoints.edit : endpoints.t2i

      // logoDataUrl may be a single string or an array of URLs/data-URLs
      const imageUrls = useLogo
        ? (Array.isArray(logoDataUrl) ? logoDataUrl : [logoDataUrl]).filter(Boolean)
        : []

      falBody = imageUrls.length > 0
        ? { prompt, aspect_ratio: ar, image_urls: imageUrls, ...(seed != null ? { seed } : {}) }
        : { prompt, aspect_ratio: ar, ...(seed != null ? { seed } : {}) }
    }

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
