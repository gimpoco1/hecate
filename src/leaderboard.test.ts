import { describe, expect, it } from 'vitest'
import { discoveryCellsFromPoints } from './geo'
import { cityLeaderboardGroups, cityTreemapLayout, displayNameForUser, leaderboardSnapshotForCities, leaderboardSnapshotFromDiscovery, mapLeaderboardRows, rankedEntries } from './leaderboard'
import type { Coordinate } from './types'

const entries = mapLeaderboardRows([
  {
    entry_id: 'a', display_name: 'Mara', total_discovered_km: '12.5', city_count: 1, updated_at: '2026-09-20', calculation_version: 3,
    leaderboard_city_stats: [{ city_id: 'barcelona', city_name: 'Barcelona', discovered_km: '4.2', discovered_percentage: '1.8' }],
    leaderboard_achievements: [{ achievement_id: 'the-long-way' }, { achievement_id: 'not-real' }],
  },
  {
    entry_id: 'b', display_name: 'Leo', total_discovered_km: 18, city_count: 1, updated_at: '2026-09-21', calculation_version: 3,
    leaderboard_city_stats: [
      { city_id: 'barcelona', city_name: 'Barcelona', discovered_km: 3, discovered_percentage: 2.4 },
      { city_id: 'empty', city_name: 'Empty City', discovered_km: 0, discovered_percentage: 0.02 },
    ],
  },
])

describe('leaderboard ranking', () => {
  it('keeps a published public name instead of resetting it from the account after reload', () => {
    const user = {
      email: 'orders.giacomo@gmail.com',
      user_metadata: {},
    } as Parameters<typeof displayNameForUser>[0]

    expect(displayNameForUser(user, 'Night Walker')).toBe('Night Walker')
    expect(displayNameForUser(user, null)).toBe('orders.giacomo')
  })

  it('removes unselected cities from both the snapshot rows and shared total', () => {
    const shared = leaderboardSnapshotForCities({
      calculationVersion: 3,
      totalDiscoveredKm: 20,
      achievements: ['the-long-way'],
      cities: [
        { cityId: 'barcelona', cityName: 'Barcelona', discoveredKm: 12, discoveredPercentage: 2 },
        { cityId: 'london', cityName: 'Greater London', discoveredKm: 5, discoveredPercentage: 1 },
      ],
    }, ['london'])

    expect(shared.cities.map(city => city.cityId)).toEqual(['london'])
    expect(shared.totalDiscoveredKm).toBe(5)
    expect(shared.achievements).toEqual(['the-long-way'])
  })

  it('maps database numeric values and ranks the overall board by distance', () => {
    expect(entries[0].totalDiscoveredKm).toBe(12.5)
    expect(entries[0].achievements).toEqual(['the-long-way'])
    expect(rankedEntries(entries, null).map(entry => entry.displayName)).toEqual(['Leo', 'Mara'])
  })

  it('ranks a city by percentage before discovered distance', () => {
    expect(rankedEntries(entries, 'barcelona').map(entry => entry.displayName)).toEqual(['Leo', 'Mara'])
  })

  it('groups explorers by city and sizes the group from their combined kilometres', () => {
    const [barcelona] = cityLeaderboardGroups(entries)
    expect(barcelona.cityName).toBe('Barcelona')
    expect(barcelona.totalDiscoveredKm).toBe(7.2)
    expect(barcelona.explorers.map(({ entry }) => entry.displayName)).toEqual(['Mara', 'Leo'])
    expect(cityLeaderboardGroups(entries).some(group => group.cityName === 'Empty City')).toBe(false)
  })

  it('lays city groups out as a complete proportional treemap', () => {
    const layout = cityTreemapLayout([
      { cityId: 'a', cityName: 'A', totalDiscoveredKm: 75, explorers: [] },
      { cityId: 'b', cityName: 'B', totalDiscoveredKm: 25, explorers: [] },
    ])
    expect(layout).toHaveLength(2)
    expect(layout.reduce((area, item) => area + item.width * item.height, 0)).toBeCloseTo(10_000)
    const largestArea = layout[0].width * layout[0].height
    const smallerArea = layout[1].width * layout[1].height
    expect(largestArea).toBeGreaterThan(smallerArea)
    expect(largestArea).toBeLessThan(7_000)
  })

  it('uses route-based kilometres for both the overall and city values', () => {
    const points: Coordinate[] = [
      { lng: 2.15, lat: 41.38, recordedAt: 1_000, walkId: 'walk' },
      { lng: 2.151, lat: 41.381, recordedAt: 2_000, walkId: 'walk' },
      { lng: 2.152, lat: 41.382, recordedAt: 3_000, walkId: 'walk' },
    ]
    const snapshot = leaderboardSnapshotFromDiscovery(points, discoveryCellsFromPoints(points), [{
      id: 'barcelona',
      name: 'Barcelona',
      fetchedAt: 1,
      geometry: {
        type: 'Polygon',
        coordinates: [[[2.1, 41.3], [2.2, 41.3], [2.2, 41.45], [2.1, 41.45], [2.1, 41.3]]],
      },
    }])
    expect(snapshot.cities[0].discoveredKm).toBeGreaterThan(0)
    expect(snapshot.calculationVersion).toBe(3)
    expect(snapshot.totalDiscoveredKm).toBeCloseTo(snapshot.cities[0].discoveredKm)
  })

  it('keeps short city routes when they contain real discovered distance', () => {
    const points: Coordinate[] = [
      { lng: -82.5515, lat: 35.5951, recordedAt: 1_000, walkId: 'sparse' },
      { lng: -82.55, lat: 35.596, recordedAt: 2_000, walkId: 'sparse' },
    ]
    const cells = discoveryCellsFromPoints([points[0]])
    const snapshot = leaderboardSnapshotFromDiscovery(points, cells, [{
      id: 'asheville',
      name: 'Asheville',
      fetchedAt: 1,
      geometry: {
        type: 'Polygon',
        coordinates: [[[-82.6, 35.5], [-82.5, 35.5], [-82.5, 35.7], [-82.6, 35.7], [-82.6, 35.5]]],
      },
    }])
    expect(snapshot.cities[0].discoveredKm).toBeGreaterThan(0)
    expect(snapshot.totalDiscoveredKm).toBeGreaterThan(0)
  })
})
