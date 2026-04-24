/**
 * Pre-flight endpoint — creates (or finds) the domain folder and session subfolder
 * exactly ONCE, then returns their IDs.
 *
 * Call this before starting parallel uploads to avoid the TOCTOU race condition
 * that caused duplicate domain folders on Google Drive.
 */

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

/**
 * Find-or-create a single folder. Sequential, no concurrency — safe from race conditions
 * when called exactly once per session.
 */
async function getOrCreateFolder(token, name, parentId) {
  const query = `name='${name}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`
  const searchUrl = `${DRIVE_FILES_URL}?q=${encodeURIComponent(query)}&fields=files(id,name)&supportsAllDrives=true&includeItemsFromAllDrives=true&corpora=allDrives`
  const search = await fetch(searchUrl, { headers: { Authorization: `Bearer ${token}` } })
  const { files } = await search.json()

  // If duplicates somehow exist (from old race), consistently use the first one
  if (files?.length > 0) return files[0].id

  const create = await fetch(`${DRIVE_FILES_URL}?supportsAllDrives=true`, {
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
    const { domain, sessionFolder } = await req.json()
    if (!domain || !sessionFolder) {
      return new Response(JSON.stringify({ error: 'Missing domain or sessionFolder' }), { status: 400 })
    }

    const safeDomain = domain
      .replace(/https?:\/\//g, '')
      .replace(/[/:?*"<>|\\]/g, '_')
      .replace(/_+$/g, '')

    const token = await getAccessToken()

    // Sequential — domain folder first, then session subfolder inside it
    const domainFolderId = await getOrCreateFolder(token, safeDomain, rootFolderId)
    const sessionFolderId = await getOrCreateFolder(token, sessionFolder, domainFolderId)
    const noLogoFolderId = await getOrCreateFolder(token, 'bez logo', sessionFolderId)

    return new Response(
      JSON.stringify({ domainFolderId, sessionFolderId, noLogoFolderId }),
      { status: 200 }
    )
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 })
  }
}

export const config = {
  path: '/.netlify/functions/ensure-drive-folders',
}
