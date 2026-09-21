import { createPrivateKey, sign } from 'node:crypto'

const DEFAULT_MAPKIT_ORIGIN = 'https://hecate-eta.vercel.app'

function encode(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url')
}

function allowedOrigins() {
  return (process.env.APPLE_MAPS_ALLOWED_ORIGINS || 'https://hecate-eta.vercel.app,capacitor://localhost,http://localhost:5173,http://127.0.0.1:5173')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean)
}

function requestOrigin(request) {
  const headerOrigin = Array.isArray(request.headers.origin) ? request.headers.origin[0] : request.headers.origin
  if (headerOrigin) return headerOrigin
  return new URL(request.url || '/', 'http://localhost').searchParams.get('origin') || undefined
}

function normalizePrivateKey(value) {
  const pem = value.replace(/\\n/g, '\n').trim()
  if (!pem.startsWith('-----BEGIN PRIVATE KEY-----') || !pem.endsWith('-----END PRIVATE KEY-----')) return pem

  // dotenv accepts quoted multiline values. If a key also contains literal
  // `\\n` separators, that produces blank lines inside the Base64 payload;
  // Node's PEM reader rejects those. Rewrap a valid PEM payload consistently.
  const body = pem
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s/g, '')
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(body)) return pem

  return `-----BEGIN PRIVATE KEY-----\n${body.match(/.{1,64}/g).join('\n')}\n-----END PRIVATE KEY-----\n`
}

function send(response, status, body) {
  response.statusCode = status
  response.end(body)
}

export default function handler(request, response) {
  const origin = requestOrigin(request)
  response.setHeader('Vary', 'Origin')
  if (origin && allowedOrigins().includes(origin)) {
    response.setHeader('Access-Control-Allow-Origin', origin)
  } else if (origin) {
    return send(response, 403, 'Origin is not allowed')
  }

  if (request.method === 'OPTIONS') {
    response.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
    return send(response, 204, '')
  }
  if (request.method !== 'GET') return send(response, 405, 'Method not allowed')

  const teamId = process.env.APPLE_MAPS_TEAM_ID
  const keyId = process.env.APPLE_MAPS_KEY_ID
  const privateKey = process.env.APPLE_MAPS_PRIVATE_KEY && normalizePrivateKey(process.env.APPLE_MAPS_PRIVATE_KEY)
  if (!teamId || !keyId || !privateKey) {
    return send(response, 503, 'Apple Maps is not configured')
  }

  let token
  try {
    const now = Math.floor(Date.now() / 1000)
    const header = encode({ alg: 'ES256', kid: keyId, typ: 'JWT' })
    // MapKit JS requires both its scope and an origin claim. Prefer the page
    // requesting this token, which is checked against our allowlist above.
    const claims = {
      iss: teamId,
      iat: now,
      exp: now + 60 * 60,
      scope: 'mapkit_js',
      origin: origin || process.env.APPLE_MAPS_ORIGIN || DEFAULT_MAPKIT_ORIGIN,
    }
    const payload = encode(claims)
    const signature = sign('sha256', Buffer.from(`${header}.${payload}`), {
      key: createPrivateKey(privateKey),
      dsaEncoding: 'ieee-p1363',
    }).toString('base64url')
    token = `${header}.${payload}.${signature}`
  } catch {
    return send(response, 503, 'Apple Maps signing key is invalid')
  }

  response.setHeader('Content-Type', 'text/plain; charset=utf-8')
  response.setHeader('Cache-Control', 'public, max-age=3000, s-maxage=3000')
  return send(response, 200, token)
}
