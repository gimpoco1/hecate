import { leaderboardSnapshotFromDiscovery, LEADERBOARD_CALCULATION_VERSION, type LeaderboardCity, type LeaderboardSnapshot } from './leaderboardSnapshot'
export { leaderboardSnapshotFromDiscovery, leaderboardSnapshotForCities, refreshedPublishedSnapshot, LEADERBOARD_CALCULATION_VERSION, type LeaderboardCity, type LeaderboardSnapshot } from './leaderboardSnapshot'
import { FunctionsHttpError, type User } from '@supabase/supabase-js'
import { isPersonalAchievementId, type PersonalAchievementId } from './achievements'
import { canonicalCityForStoredBoundary, type CityBoundary } from './city'
import { loadDiscoveredCities, loadSyncedDiscovery, supabase } from './storage'

export type LeaderboardEntry = {
  entryId: string
  displayName: string
  totalDiscoveredKm: number
  cityCount: number
  updatedAt: string
  cities: LeaderboardCity[]
  achievements: PersonalAchievementId[]
}

export type LeaderboardProfile = {
  entryId: string | null
  displayName: string
  displayNameChanges: number
}

type LeaderboardRow = {
  entry_id: string
  display_name: string
  total_discovered_km: number | string
  city_count: number
  updated_at: string
  calculation_version: number
  achievement_ids?: string[] | null
  leaderboard_city_stats?: Array<{
    city_id: string
    city_name: string
    discovered_km: number | string
    discovered_percentage: number | string
  }>
}

export type CityLeaderboardGroup = {
  cityId: string
  cityName: string
  totalDiscoveredKm: number
  explorers: Array<{
    entry: LeaderboardEntry
    city: LeaderboardCity
  }>
}

export type CityTreemapItem = CityLeaderboardGroup & {
  left: number
  top: number
  width: number
  height: number
}

export function displayNameForUser(user: User, publishedDisplayName?: string | null) {
  if (typeof publishedDisplayName === 'string' && publishedDisplayName.trim()) {
    return publishedDisplayName.trim().slice(0, 30)
  }
  const metadataName = user.user_metadata?.full_name || user.user_metadata?.name
  if (typeof metadataName === 'string' && metadataName.trim()) return metadataName.trim().slice(0, 30)
  return user.email?.split('@')[0]?.slice(0, 30) || 'Explorer'
}

export function mapLeaderboardRows(rows: LeaderboardRow[]): LeaderboardEntry[] {
  return rows.map(row => ({
    entryId: row.entry_id,
    displayName: row.display_name,
    totalDiscoveredKm: Number(row.total_discovered_km),
    cityCount: row.city_count,
    updatedAt: row.updated_at,
    cities: (row.leaderboard_city_stats ?? []).map(city => ({
      cityId: city.city_id,
      cityName: city.city_name,
      discoveredKm: Number(city.discovered_km),
      discoveredPercentage: Number(city.discovered_percentage),
    })),
    achievements: (row.achievement_ids ?? []).filter(isPersonalAchievementId),
  }))
}

export function rankedEntries(entries: LeaderboardEntry[], cityId: string | null) {
  return [...entries].sort((a, b) => {
    if (cityId) {
      const cityA = a.cities.find(city => city.cityId === cityId)
      const cityB = b.cities.find(city => city.cityId === cityId)
      const percentageDifference = (cityB?.discoveredPercentage ?? -1) - (cityA?.discoveredPercentage ?? -1)
      if (percentageDifference) return percentageDifference
      const distanceDifference = (cityB?.discoveredKm ?? -1) - (cityA?.discoveredKm ?? -1)
      if (distanceDifference) return distanceDifference
    }
    return b.totalDiscoveredKm - a.totalDiscoveredKm || a.displayName.localeCompare(b.displayName)
  })
}

export function cityLeaderboardGroups(entries: LeaderboardEntry[]): CityLeaderboardGroup[] {
  const groups = new Map<string, CityLeaderboardGroup>()
  entries.forEach(entry => entry.cities.forEach(city => {
    // A value that renders as 0 m is not a leaderboard result and should not
    // create an empty city tile.
    if (Math.round(city.discoveredKm * 1_000) === 0) return
    const group = groups.get(city.cityId) ?? {
      cityId: city.cityId,
      cityName: city.cityName,
      totalDiscoveredKm: 0,
      explorers: [],
    }
    group.totalDiscoveredKm += city.discoveredKm
    group.explorers.push({ entry, city })
    groups.set(city.cityId, group)
  }))

  return [...groups.values()]
    .map(group => ({
      ...group,
      explorers: group.explorers
        .sort((a, b) => b.city.discoveredKm - a.city.discoveredKm
          || b.city.discoveredPercentage - a.city.discoveredPercentage
          || a.entry.displayName.localeCompare(b.entry.displayName))
        .slice(0, 100),
    }))
    .sort((a, b) => b.totalDiscoveredKm - a.totalDiscoveredKm || a.cityName.localeCompare(b.cityName))
}

export function cityTreemapLayout(groups: CityLeaderboardGroup[]): CityTreemapItem[] {
  if (!groups.length) return []
  const largestWeight = Math.sqrt(groups[0].totalDiscoveredKm)
  const weighted = groups.map(group => ({
    group,
    // A square-root scale keeps the ranking visible without letting one city
    // consume nearly the whole board. The floor keeps every tile comfortable
    // to read and tap.
    weight: Math.max(Math.sqrt(group.totalDiscoveredKm), largestWeight * 0.42, 0.001),
  }))
  const layout: CityTreemapItem[] = []

  const place = (items: typeof weighted, left: number, top: number, width: number, height: number) => {
    if (items.length === 1) {
      layout.push({ ...items[0].group, left, top, width, height })
      return
    }
    const total = items.reduce((sum, item) => sum + item.weight, 0)
    let splitAt = 1
    let firstWeight = items[0].weight
    let smallestDifference = Math.abs(total / 2 - firstWeight)
    for (let index = 2; index < items.length; index += 1) {
      const candidateWeight = firstWeight + items[index - 1].weight
      const difference = Math.abs(total / 2 - candidateWeight)
      if (difference >= smallestDifference) break
      firstWeight = candidateWeight
      smallestDifference = difference
      splitAt = index
    }
    const ratio = firstWeight / total
    if (width >= height) {
      const firstWidth = width * ratio
      place(items.slice(0, splitAt), left, top, firstWidth, height)
      place(items.slice(splitAt), left + firstWidth, top, width - firstWidth, height)
    } else {
      const firstHeight = height * ratio
      place(items.slice(0, splitAt), left, top, width, firstHeight)
      place(items.slice(splitAt), left, top + firstHeight, width, height - firstHeight)
    }
  }

  place(weighted, 0, 0, 100, 100)
  return layout
}

export async function loadMyLeaderboardProfile(): Promise<LeaderboardProfile | null> {
  if (!supabase) return null
  const { data, error } = await supabase.rpc('get_my_leaderboard_profile')
  if (error) throw error
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null
  const profile = data as Record<string, unknown>
  if (typeof profile.display_name !== 'string') return null
  return {
    entryId: typeof profile.entry_id === 'string' ? profile.entry_id : null,
    displayName: profile.display_name,
    displayNameChanges: Number(profile.display_name_changes ?? 0),
  }
}

export async function buildLeaderboardSnapshot(userId: string): Promise<LeaderboardSnapshot> {
  const [{ points, cells }, cities] = await Promise.all([
    loadSyncedDiscovery(userId),
    loadDiscoveredCities(userId),
  ])
  const canonicalCities = new Map<string, CityBoundary>()
  for (const storedCity of cities) {
    const city = await canonicalCityForStoredBoundary(storedCity)
    const existing = canonicalCities.get(city.id)
    canonicalCities.set(city.id, existing ? {
      ...city,
      firstDiscoveredAt: Math.min(existing.firstDiscoveredAt ?? Infinity, city.firstDiscoveredAt ?? Infinity),
      lastDiscoveredAt: Math.max(existing.lastDiscoveredAt ?? 0, city.lastDiscoveredAt ?? 0),
    } : city)
  }
  return leaderboardSnapshotFromDiscovery(points, cells, [...canonicalCities.values()], Intl.DateTimeFormat().resolvedOptions().timeZone)
}

export async function refreshPublishedLeaderboardSnapshot(userId: string) {
  if (!supabase) return false
  const profile = await loadMyLeaderboardProfile()
  if (!profile?.entryId) return false

  const publishedEntry = await loadLeaderboardEntry(profile.entryId)
  if (!publishedEntry) return false
  await publishLeaderboardCities(publishedEntry.displayName, publishedEntry.cities.map(city => city.cityId), Intl.DateTimeFormat().resolvedOptions().timeZone, userId)
  return true
}

export async function publishLeaderboardSnapshot(displayName: string, snapshot: LeaderboardSnapshot, expectedUserId: string): Promise<void> {
  await publishLeaderboardCities(displayName, snapshot.cities.map(city => city.cityId), Intl.DateTimeFormat().resolvedOptions().timeZone, expectedUserId)
}

async function publishLeaderboardCities(displayName: string, cityIds: string[], timeZone: string, expectedUserId: string): Promise<void> {
  if (!supabase) throw new Error('Hecate account sync is not configured')
  const { data: { session }, error: sessionError } = await supabase.auth.getSession()
  if (sessionError) throw sessionError
  if (!session || session.user.id !== expectedUserId) throw new Error('The signed-in account changed before publishing. Sign in again and retry.')
  const { error } = await supabase.functions.invoke('publish-leaderboard', {
    headers: { Authorization: `Bearer ${session.access_token}` },
    body: { displayName: displayName.trim(), cityIds, timeZone },
  })
  if (error instanceof FunctionsHttpError) {
    const response: unknown = await error.context.json()
    if (response && typeof response === 'object' && 'error' in response && typeof response.error === 'string') {
      throw new Error(response.error)
    }
  }
  if (error) throw error
}

export async function unpublishLeaderboardSnapshot() {
  if (!supabase) return
  const { error } = await supabase.rpc('unpublish_leaderboard_snapshot')
  if (error) throw error
}

export type LeaderboardCitySummary = CityLeaderboardGroup & { explorerCount: number }

function responseObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function responseNumber(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new TypeError('The leaderboard returned an invalid number.')
  return value
}

function parseExplorer(value: unknown, cityId: string, cityName: string): CityLeaderboardGroup['explorers'][number] {
  if (!responseObject(value) || typeof value.entry_id !== 'string' || typeof value.display_name !== 'string' ||
      typeof value.updated_at !== 'string' || !Array.isArray(value.achievement_ids)) throw new TypeError('The leaderboard returned an invalid explorer.')
  const city: LeaderboardCity = { cityId, cityName, discoveredKm: responseNumber(value.discovered_km),
    discoveredPercentage: responseNumber(value.discovered_percentage) }
  return { city, entry: { entryId: value.entry_id, displayName: value.display_name,
    totalDiscoveredKm: responseNumber(value.total_discovered_km), cityCount: responseNumber(value.city_count),
    updatedAt: value.updated_at, cities: [city], achievements: value.achievement_ids.filter(isPersonalAchievementId) } }
}

export async function loadLeaderboardCities(offset: number, citySlug: string | null): Promise<LeaderboardCitySummary[]> {
  if (!supabase) return []
  const { data, error } = await supabase.rpc('get_leaderboard_city_page', { p_offset: offset, p_limit: 50, p_city_slug: citySlug })
  if (error) throw error
  if (!Array.isArray(data)) throw new TypeError('The leaderboard city response must be an array.')
  return data.map((value: unknown): LeaderboardCitySummary => {
    if (!responseObject(value) || typeof value.city_id !== 'string' || typeof value.city_name !== 'string' || !Array.isArray(value.leaders)) {
      throw new TypeError('The leaderboard returned an invalid city summary.')
    }
    const cityId = value.city_id
    const cityName = value.city_name
    return { cityId, cityName, totalDiscoveredKm: responseNumber(value.total_discovered_km), explorerCount: responseNumber(value.explorer_count),
      explorers: value.leaders.map((leader: unknown) => parseExplorer(leader, cityId, cityName)) }
  })
}

export async function loadCityExplorers(city: { cityId: string; cityName: string }, offset: number): Promise<CityLeaderboardGroup['explorers']> {
  if (!supabase) return []
  const { data, error } = await supabase.rpc('get_leaderboard_city_explorers', { p_city_id: city.cityId, p_offset: offset, p_limit: 50 })
  if (error) throw error
  if (!Array.isArray(data)) throw new TypeError('The city explorer response must be an array.')
  return data.map((value: unknown) => parseExplorer(value, city.cityId, city.cityName))
}

export async function loadLeaderboardEntry(entryId: string): Promise<LeaderboardEntry | null> {
  if (!supabase) return null
  const { data, error } = await supabase.from('leaderboard_entries')
    .select('entry_id,display_name,total_discovered_km,city_count,updated_at,calculation_version,achievement_ids,leaderboard_city_stats(city_id,city_name,discovered_km,discovered_percentage)')
    .eq('entry_id', entryId).maybeSingle()
  if (error) throw error
  if (!data) return null
  if (!responseObject(data) || !Array.isArray(data.leaderboard_city_stats)) throw new TypeError('The explorer profile response is invalid.')
  const entry = parseExplorer({ ...data, discovered_km: 0, discovered_percentage: 0 }, '', '').entry
  const cities = data.leaderboard_city_stats.map((value: unknown): LeaderboardCity => {
    if (!responseObject(value) || typeof value.city_id !== 'string' || typeof value.city_name !== 'string') throw new TypeError('The explorer city response is invalid.')
    return { cityId: value.city_id, cityName: value.city_name, discoveredKm: responseNumber(value.discovered_km), discoveredPercentage: responseNumber(value.discovered_percentage) }
  })
  return { ...entry, cities }
}
