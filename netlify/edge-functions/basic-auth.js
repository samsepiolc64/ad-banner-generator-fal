export default async (req, context) => {
  const user = Deno.env.get('APP_USER')
  const pass = Deno.env.get('APP_PASSWORD')

  // If credentials not configured, allow access (so dev env works without setup)
  if (!user || !pass) return context.next()

  const authHeader = req.headers.get('Authorization') || ''
  if (authHeader.startsWith('Basic ')) {
    const decoded = atob(authHeader.slice(6))
    const [u, p] = decoded.split(':')
    if (u === user && p === pass) return context.next()
  }

  return new Response('Unauthorized', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="Generator banerów"',
    },
  })
}

export const config = { path: '/*' }
