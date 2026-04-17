const DRIVE_FILES_URL = 'https://www.googleapis.com/drive/v3/files'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'

async function getAccessToken() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
  const rawKey = process.env.GOOGLE_PRIVATE_KEY

  if (!email || !rawKey) throw new Error('Google credentials not configured')

  const privateKey = rawKey.replace(/\\n/g, '\n')

  const now = Math.floor(Date.now() / 1000)
  const payload = {
    iss: email,
    scope: 'https://www.googleapis.com/auth/drive',
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600,
  }

  const header = { alg: 'RS256', typ: 'JWT' }
  const encode = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url')
  const signingInput = `${encode(header)}.${encode(payload)}`

  const { createSign } = await import('node:crypto')
  const sign = createSign('RSA-SHA256')
  sign.update(signingInput)
  const signature = sign.sign(privateKey, 'base64url')
  const jwt = `${signingInput}.${signature}`

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  })

  const data = await res.json()
  if (!data.access_token) throw new Error(`Token error: ${JSON.stringify(data)}`)
  return data.access_token
}

async function getOrCreateFolder(token, name, parentId) {
  const query = `name='${name}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`
  const search = await fetch(`${DRIVE_FILES_URL}?q=${encodeURIComponent(query)}&fields=files(id,name)`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const { files } = await search.json()
  if (files?.length > 0) return files[0].id

  const create = await fetch(DRIVE_FILES_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    }),
  })
  const folder = await create.json()
  return folder.id
}

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 })
  }

  const rootFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID
  if (!rootFolderId) {
    return new Response(JSON.stringify({ error: 'GOOGLE_DRIVE_FOLDER_ID not configured' }), { status: 500 })
  }

  try {
    const { filename, imageBase64, domain, sessionFolder } = await req.json()

    if (!filename || !imageBase64 || !domain || !sessionFolder) {
      return new Response(JSON.stringify({ error: 'Missing fields' }), { status: 400 })
    }

    const token = await getAccessToken()
    console.log('[drive] token ok')

    const domainFolderId = await getOrCreateFolder(token, domain, rootFolderId)
    console.log('[drive] domainFolder:', domainFolderId)

    const sessionFolderId = await getOrCreateFolder(token, sessionFolder, domainFolderId)
    console.log('[drive] sessionFolder:', sessionFolderId)

    const imageBuffer = Buffer.from(imageBase64, 'base64')
    console.log('[drive] imageBuffer size:', imageBuffer.length)

    // Step 1: Initiate resumable upload session
    const initiateRes = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'X-Upload-Content-Type': 'image/jpeg',
          'X-Upload-Content-Length': String(imageBuffer.length),
        },
        body: JSON.stringify({ name: filename, parents: [sessionFolderId] }),
      }
    )
    console.log('[drive] initiate status:', initiateRes.status)
    if (!initiateRes.ok) {
      const errText = await initiateRes.text().catch(() => '')
      throw new Error(`Initiate upload failed: HTTP ${initiateRes.status} — ${errText.slice(0, 300)}`)
    }
    const uploadUri = initiateRes.headers.get('location')
    console.log('[drive] uploadUri host:', uploadUri ? new URL(uploadUri).hostname : 'MISSING')
    if (!uploadUri) throw new Error('No upload URI returned from Drive API')

    // Step 2: Upload binary content
    const uploadRes = await fetch(uploadUri, {
      method: 'PUT',
      headers: {
        'Content-Type': 'image/jpeg',
        'Content-Length': String(imageBuffer.length),
        'Content-Range': `bytes 0-${imageBuffer.length - 1}/${imageBuffer.length}`,
      },
      body: new Uint8Array(imageBuffer),
    })
    console.log('[drive] upload status:', uploadRes.status)
    if (!uploadRes.ok) {
      const errText = await uploadRes.text().catch(() => '')
      throw new Error(`Content upload failed: HTTP ${uploadRes.status} — ${errText.slice(0, 300)}`)
    }
    const result = await uploadRes.json()
    console.log('[drive] result id:', result.id)
    if (!result.id) throw new Error(`Upload no ID: ${JSON.stringify(result)}`)

    return new Response(JSON.stringify({ fileId: result.id }), { status: 200 })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 })
  }
}

export const config = {
  path: '/.netlify/functions/upload-to-drive',
}
