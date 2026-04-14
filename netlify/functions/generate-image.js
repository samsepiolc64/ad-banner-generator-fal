/**
 * Netlify Function: Proxy for fal.ai image generation.
 * Keeps the FAL_API_KEY secure on the server side.
 *
 * Endpoints:
 *   NB2 text-to-image:  https://fal.run/fal-ai/nano-banana-2
 *   NB2 edit (logo):    https://fal.run/fal-ai/nano-banana-2/edit
 *   NB Pro text-to-image: https://fal.run/fal-ai/nano-banana-pro
 *   NB Pro edit (logo):   https://fal.run/fal-ai/nano-banana-pro/edit
 */

const ENDPOINTS = {
  nb2: {
    t2i: 'https://fal.run/fal-ai/nano-banana-2',
    edit: 'https://fal.run/fal-ai/nano-banana-2/edit',
  },
  nbpro: {
    t2i: 'https://fal.run/fal-ai/nano-banana-pro',
    edit: 'https://fal.run/fal-ai/nano-banana-pro/edit',
  },
}

export default async (req) => {
  // Only allow POST
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const FAL_API_KEY = process.env.FAL_API_KEY
  if (!FAL_API_KEY) {
    return new Response(
      JSON.stringify({ error: 'FAL_API_KEY not configured. Add it in Netlify Environment Variables.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }

  try {
    const body = await req.json()
    const { prompt, ar, modelType, useLogo, logoDataUrl } = body

    if (!prompt || !ar || !modelType) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: prompt, ar, modelType' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const endpoints = ENDPOINTS[modelType] || ENDPOINTS.nbpro
    const endpoint = useLogo ? endpoints.edit : endpoints.t2i

    const falBody = useLogo
      ? { prompt, aspect_ratio: ar, image_urls: [logoDataUrl] }
      : { prompt, aspect_ratio: ar }

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
        JSON.stringify({ error: `fal.ai error: HTTP ${falRes.status} — ${errText.slice(0, 300)}` }),
        { status: falRes.status, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const data = await falRes.json()
    const imageUrl = data.images?.[0]?.url

    if (!imageUrl) {
      return new Response(
        JSON.stringify({ error: 'No image URL in fal.ai response' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ imageUrl }),
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
