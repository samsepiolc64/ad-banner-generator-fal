/**
 * Netlify Function: Proxy an external image URL.
 * Fetches the image server-side and returns it as a base64 data URL.
 * Solves two problems:
 *   1. CORS — browser can't always fetch cross-origin images for canvas use.
 *   2. Format — fal.ai rejects WebP in image_urls; we return raw bytes,
 *      caller converts to JPEG via canvas (compressRefImage).
 */

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    const { url } = await req.json()

    if (!url || !/^https?:\/\//i.test(url)) {
      return new Response(
        JSON.stringify({ error: 'Invalid or missing URL' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; BannerGenerator/1.0)',
        'Accept': 'image/*,*/*;q=0.8',
      },
    })

    if (!res.ok) {
      return new Response(
        JSON.stringify({ error: `Failed to fetch image: HTTP ${res.status}` }),
        { status: 502, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const contentType = res.headers.get('content-type')?.split(';')[0]?.trim() || 'image/jpeg'

    // Only allow image types
    if (!contentType.startsWith('image/')) {
      return new Response(
        JSON.stringify({ error: `URL does not point to an image (content-type: ${contentType})` }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const buffer = await res.arrayBuffer()
    const base64 = Buffer.from(buffer).toString('base64')
    const dataUrl = `data:${contentType};base64,${base64}`

    return new Response(
      JSON.stringify({ dataUrl }),
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
  path: '/.netlify/functions/proxy-image',
}
