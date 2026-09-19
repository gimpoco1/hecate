import { createPrivateKey, sign } from 'node:crypto'

function encode(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url')
}

function allowedOrigins() {
  return (process.env.APPLE_MAPS_ALLOWED_ORIGINS || 'https://hecate-eta.vercel.app,capacitor://localhost')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean)
}

export default function handler(request, response) {
  const origin = request.headers.origin
  response.setHeader('Vary', 'Origin')
  if (origin && allowedOrigins().includes(origin)) {
    response.setHeader('Access-Control-Allow-Origin', origin)
  } else if (origin) {
    return response.status(403).send('Origin is not allowed')
  }

  if (request.method === 'OPTIONS') {
    response.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
    return response.status(204).end()
  }
  if (request.method !== 'GET') return response.status(405).send('Method not allowed')

  const teamId = process.env.APPLE_MAPS_TEAM_ID
  const keyId = process.env.APPLE_MAPS_KEY_ID
  const privateKey = process.env.APPLE_MAPS_PRIVATE_KEY?.replace(/\\n/g, '\n')
  if (!teamId || !keyId || !privateKey) {
    return response.status(503).send('Apple Maps is not configured')
  }

  const now = Math.floor(Date.now() / 1000)
  const header = encode({ alg: 'ES256', kid: keyId, typ: 'JWT' })
  const claims = { iss: teamId, iat: now, exp: now + 60 * 60 }
  if (process.env.APPLE_MAPS_ORIGIN) claims.origin = process.env.APPLE_MAPS_ORIGIN
  const payload = encode(claims)
  const signature = sign('sha256', Buffer.from(`${header}.${payload}`), {
    key: createPrivateKey(privateKey),
    dsaEncoding: 'ieee-p1363',
  }).toString('base64url')

  response.setHeader('Content-Type', 'text/plain; charset=utf-8')
  response.setHeader('Cache-Control', 'public, max-age=3000, s-maxage=3000')
  return response.status(200).send(`${header}.${payload}.${signature}`)
}
