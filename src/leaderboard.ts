import type { User } from '@supabase/supabase-js'
import { canonicalCityForStoredBoundary, discoveredCityDistanceKm, discoveredCityPercentage, type CityBoundary } from './city'
import { discoveredDistanceKm } from './geo'
import { loadDiscoveredCities, loadSyncedDiscovery, supabase } from './storage'
import type { Coordinate, DiscoveryCell } from './types'

export type LeaderboardCity = {
  cityId: string
  cityName: string
  discoveredKm: number
  discoveredPercentage: number
}

export type LeaderboardEntry = {
  entryId: string
  displayName: string
  totalDiscoveredKm: number
  cityCount: number
  updatedAt: string
  cities: LeaderboardCity[]
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
  leaderboard_city_stats?: Array<{
    city_id: string
    city_name: string
    discovered_km: number | string
    discovered_percentage: number | string
  }>
}

export const LEADERBOARD_CALCULATION_VERSION = 3

export type LeaderboardSnapshot = {
  calculationVersion: number
  totalDiscoveredKm: number
  cities: LeaderboardCity[]
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

export async function loadLeaderboard() {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('leaderboard_entries')
    .select('entry_id,display_name,total_discovered_km,city_count,updated_at,calculation_version,leaderboard_city_stats(city_id,city_name,discovered_km,discovered_percentage)')
    .eq('calculation_version', LEADERBOARD_CALCULATION_VERSION)
    .order('total_discovered_km', { ascending: false })
  if (error) throw error
  return mapLeaderboardRows((data ?? []) as LeaderboardRow[])
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
  return leaderboardSnapshotFromDiscovery(points, cells, [...canonicalCities.values()])
}

export function leaderboardSnapshotFromDiscovery(
  points: Coordinate[],
  cells: DiscoveryCell[],
  cities: CityBoundary[],
): LeaderboardSnapshot {
  const citySnapshots = cities
    .map(city => ({
      cityId: city.id,
      cityName: city.name,
      // Match the native city drawer exactly. Cells determine revealed area and
      // percentage, but their ordered centers are only an approximate route and
      // must never be used as a kilometre counter.
      discoveredKm: discoveredCityDistanceKm(points, city),
      discoveredPercentage: discoveredCityPercentage(cells, city),
    }))
    .sort((a, b) => b.discoveredPercentage - a.discoveredPercentage)

  return {
    calculationVersion: LEADERBOARD_CALCULATION_VERSION,
    // Overall discovery is global new ground. City rows are clipped to their
    // boundaries, so Barcelona can correctly show 17.9 km while the account's
    // complete discovery total remains 18.3 km.
    totalDiscoveredKm: discoveredDistanceKm(points),
    cities: citySnapshots,
  }
}

export function leaderboardSnapshotForCities(
  snapshot: LeaderboardSnapshot,
  selectedCityIds: Iterable<string>,
): LeaderboardSnapshot {
  const selected = new Set(selectedCityIds)
  const cities = snapshot.cities.filter(city => selected.has(city.cityId))
  return {
    ...snapshot,
    // A user who omits a city must not leak that city's distance through the
    // aggregate total. The shared total is therefore limited to selected rows.
    totalDiscoveredKm: cities.reduce((total, city) => total + city.discoveredKm, 0),
    cities,
  }
}

export async function publishLeaderboardSnapshot(displayName: string, snapshot: LeaderboardSnapshot) {
  if (!supabase) throw new Error('Hecate account sync is not configured')
  const { error } = await supabase.rpc('publish_leaderboard_snapshot', {
    p_display_name: displayName.trim(),
    p_total_discovered_km: snapshot.totalDiscoveredKm,
    p_calculation_version: snapshot.calculationVersion,
    p_cities: snapshot.cities.map(city => ({
      city_id: city.cityId,
      city_name: city.cityName,
      discovered_km: city.discoveredKm,
      discovered_percentage: city.discoveredPercentage,
    })),
  })
  if (error) throw error
}

export async function unpublishLeaderboardSnapshot() {
  if (!supabase) return
  const { error } = await supabase.rpc('unpublish_leaderboard_snapshot')
  if (error) throw error
}
