// Include lazy city geometry modules in the hosted function's deployment graph.
import '../../../src/regions/greater-london.ts'
import '../../../src/regions/barcelona-metropolitan.ts'
import '../../../src/regions/new-york.ts'
import { createClient, type PostgrestError } from '@supabase/supabase-js'
import { canonicalCityForStoredBoundary } from '../../../src/city.ts'
import { loadStoredDiscovery } from '../../../src/discoveryStorage.ts'
import { discoveryCellsFromPoints, mergeDiscoveryCells } from '../../../src/geo.ts'
import { leaderboardSnapshotFromDiscovery, leaderboardSnapshotForCities } from '../../../src/leaderboardSnapshot.ts'
import { PayloadTooLargeError, readJson } from '../_shared/http.ts'

type PublishRequest = { displayName: string; cityIds: string[]; timeZone: string }
const WEB_ORIGIN = 'https://hecate-explore.vercel.app'

function parsePublishRequest(value: unknown): PublishRequest {
  if (!value || typeof value !== 'object' || !('timeZone' in value) || typeof value.timeZone !== 'string' || value.timeZone.length > 80 || !('displayName' in value) || typeof value.displayName !== 'string' ||
      value.displayName.trim().length < 2 || value.displayName.trim().length > 30 || !('cityIds' in value) ||
      !Array.isArray(value.cityIds) || value.cityIds.length < 1 || value.cityIds.length > 500 ||
      !value.cityIds.every((id: unknown) => typeof id === 'string' && id.length >= 1 && id.length <= 160)) {
    throw new TypeError('Publishing requires a 2–30 character public name and 1–500 city IDs of at most 160 characters.')
  }
  new Intl.DateTimeFormat('en-US', { timeZone: value.timeZone }).format(0)
  return { displayName: value.displayName.trim(), cityIds: [...new Set(value.cityIds as string[])], timeZone: value.timeZone }
}

function environment(name: string): string {
  const value = Deno.env.get(name)
  if (!value) throw new Error(`Missing server configuration: ${name}`)
  return value
}

function databaseFailure(error: PostgrestError, headers: Headers): Response {
  if (error.code === 'RATE_LIMITED') return Response.json({ error: error.message }, { status: 429, headers })
  if (['P0001', '22023'].includes(error.code)) return Response.json({ error: error.message }, { status: 400, headers })
  console.error('Leaderboard database operation failed', { code: error.code })
  return Response.json({ error: 'Leaderboard publishing failed. Try again or contact support.', code: error.code }, { status: 502, headers })
}

Deno.serve(async (request: Request): Promise<Response> => {
  const origin = request.headers.get('origin')
  const headers = new Headers({ 'Vary': 'Origin', 'Cache-Control': 'no-store' })
  if (origin === WEB_ORIGIN || origin === 'capacitor://localhost' || origin === 'https://localhost' || origin === 'http://localhost' || origin === 'http://localhost:5173' || origin === 'http://127.0.0.1:5173') {
    headers.set('Access-Control-Allow-Origin', origin)
    headers.set('Access-Control-Allow-Headers', 'authorization, apikey, content-type, x-client-info')
    headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
  } else if (origin) return Response.json({ error: 'Origin is not allowed.' }, { status: 403, headers })
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers })
  if (request.method !== 'POST') return Response.json({ error: 'POST required.' }, { status: 405, headers })
  const authorization = request.headers.get('authorization')
  if (!authorization?.startsWith('Bearer ')) return Response.json({ error: 'Sign in before publishing.' }, { status: 401, headers })
  const url = environment('SUPABASE_URL')
  const client = createClient(url, environment('SUPABASE_ANON_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: authorization } },
  })
  const { data: { user }, error: authError } = await client.auth.getUser(authorization.slice(7))
  if (authError || !user) return Response.json({ error: 'Sign in again before publishing.' }, { status: 401, headers })
  let submission: PublishRequest
  try { submission = parsePublishRequest(await readJson(request, 100_000)) }
  catch (error) {
    if (!(error instanceof TypeError) && !(error instanceof SyntaxError) && !(error instanceof PayloadTooLargeError) && !(error instanceof RangeError)) throw error
    return Response.json({ error: error.message }, { status: error instanceof PayloadTooLargeError ? 413 : 400, headers })
  }
  const quota = await client.rpc('begin_leaderboard_publish')
  if (quota.error) return databaseFailure(quota.error, headers)
  try {
    // Every read uses the caller's JWT and RLS. The request never supplies scores or achievements.
    const stored = await loadStoredDiscovery(client)
    const cities = await Promise.all(stored.cities.map(canonicalCityForStoredBoundary))
    const uniqueCities = [...new Map(cities.map(city => [city.id, city])).values()]
    if (submission.cityIds.some(id => !uniqueCities.some(city => city.id === id))) {
      return Response.json({ error: 'A selected city is not in your saved discovery history. Sync your app and try again.' }, { status: 400, headers })
    }
    const cells = mergeDiscoveryCells(stored.cells, discoveryCellsFromPoints(stored.points))
    const snapshot = leaderboardSnapshotForCities(leaderboardSnapshotFromDiscovery(stored.points, cells, uniqueCities, submission.timeZone), submission.cityIds)
    const service = createClient(url, environment('SUPABASE_SERVICE_ROLE_KEY'), {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    })
    const result = await service.rpc('store_leaderboard_snapshot', {
      p_user_id: user.id, p_request_id: quota.data, p_display_name: submission.displayName,
      p_total_discovered_km: snapshot.totalDiscoveredKm, p_calculation_version: snapshot.calculationVersion,
      p_cities: snapshot.cities.map(city => ({ city_id: city.cityId, city_name: city.cityName,
        discovered_km: city.discoveredKm, discovered_percentage: city.discoveredPercentage })),
      p_achievements: snapshot.achievements,
    })
    if (result.error) return databaseFailure(result.error, headers)
    return Response.json({ entryId: result.data }, { headers })
  } catch (error) {
    console.error('Leaderboard computation failed', { errorType: error instanceof Error ? error.name : 'DatabaseError' })
    return Response.json({ error: 'Your saved discovery history could not be published. Sync the app and try again, or contact support.' }, { status: 502, headers })
  }
})
