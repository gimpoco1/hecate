import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js'
import { discoveryCellsFromPoints, mergeDiscoveryCells } from './geo'
import type { Coordinate, DiscoveryCell, PendingWalk } from './types'

type SyncedDiscovery = { points: Coordinate[]; cells: DiscoveryCell[] }

const LEGACY_DISCOVERY_KEYS = [
  'hecate:discovery-points:v1',
  'hecate:discovery-cells:v1',
  'hecate:active-walk:v1',
  'hecate:walk-outbox:v1',
  'hecate:city-boundary:v1',
  'unfold:discovery-points:v1',
]

// Remove discovery data written by versions that predated account-only storage.
export function purgeLegacyDiscoveryCache() {
  try {
    LEGACY_DISCOVERY_KEYS.forEach(key => localStorage.removeItem(key))
  } catch {
    // Some privacy modes disable Web Storage; account-backed discovery still works.
  }
}

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const isSyncConfigured = Boolean(supabaseUrl && supabaseKey)
export const supabase: SupabaseClient | null = isSyncConfigured
  ? createClient(supabaseUrl!, supabaseKey!, { auth: { persistSession: true } })
  : null

async function currentUser(): Promise<User | null> {
  if (!supabase) return null
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

let uploadedCellUser: string | null = null
let uploadedCellKeys = new Set<string>()

export async function syncDiscoveryCells(cells: DiscoveryCell[], expectedUserId: string) {
  if (!supabase || cells.length === 0) return
  const user = await currentUser()
  if (!user || user.id !== expectedUserId) return
  if (uploadedCellUser !== user.id) {
    uploadedCellUser = user.id
    uploadedCellKeys = new Set()
  }

  const unsynced = cells.filter(cell => !uploadedCellKeys.has(`${cell.z}/${cell.x}/${cell.y}`))
  for (let offset = 0; offset < unsynced.length; offset += 1_000) {
    const batch = unsynced.slice(offset, offset + 1_000)
    const rows = batch.map(cell => ({
      user_id: user.id,
      cell_z: cell.z,
      cell_x: cell.x,
      cell_y: cell.y,
      first_discovered_at: new Date(cell.discoveredAt).toISOString(),
    }))
    const { error } = await supabase.from('discovery_cells').upsert(rows, {
      onConflict: 'user_id,cell_z,cell_x,cell_y',
      ignoreDuplicates: true,
    })
    if (error) throw error
    batch.forEach(cell => uploadedCellKeys.add(`${cell.z}/${cell.x}/${cell.y}`))
  }
}

export async function saveCompletedWalk(walk: PendingWalk, expectedUserId: string) {
  if (!supabase || walk.points.length < 2) return
  const user = await currentUser()
  if (!user || user.id !== expectedUserId) throw new Error('The signed-in account changed before the walk could be saved')
  const { error } = await supabase.rpc('save_walk', {
    p_walk_id: walk.id,
    p_started_at: new Date(walk.startedAt).toISOString(),
    p_finished_at: new Date(walk.finishedAt).toISOString(),
    p_coordinates: walk.points.map(point => [point.lng, point.lat]),
    p_point_count: walk.points.length,
  })
  if (error) throw error
}

async function loadRemoteCells(): Promise<DiscoveryCell[]> {
  if (!supabase) return []
  const cells: DiscoveryCell[] = []
  for (let offset = 0; ; offset += 1_000) {
    const { data, error } = await supabase
      .from('discovery_cells')
      .select('cell_z,cell_x,cell_y,first_discovered_at')
      .order('cell_z').order('cell_x').order('cell_y')
      .range(offset, offset + 999)
    if (error) return []
    cells.push(...(data ?? []).map(row => ({
      z: row.cell_z,
      x: row.cell_x,
      y: row.cell_y,
      discoveredAt: new Date(row.first_discovered_at).getTime(),
    })))
    if (!data || data.length < 1_000) break
  }
  return cells
}

async function loadRemoteWalkPoints(): Promise<Coordinate[]> {
  if (!supabase) return []
  const { data, error } = await supabase.rpc('get_walk_routes')
  if (error || !Array.isArray(data)) return []
  return data.flatMap(row => {
    const coordinates = Array.isArray(row.coordinates) ? row.coordinates : []
    const startedAt = new Date(row.started_at).getTime()
    const finishedAt = new Date(row.finished_at).getTime()
    return coordinates.flatMap((coordinate: unknown, index: number): Coordinate[] => {
      if (!Array.isArray(coordinate) || coordinate.length < 2) return []
      const progress = coordinates.length > 1 ? index / (coordinates.length - 1) : 0
      return [{
        lng: Number(coordinate[0]),
        lat: Number(coordinate[1]),
        recordedAt: startedAt + (finishedAt - startedAt) * progress,
        walkId: row.walk_id,
      }]
    })
  })
}

async function loadLegacyPoints(): Promise<Coordinate[]> {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('discovery_points')
    .select('longitude,latitude,recorded_at,accuracy')
    .order('recorded_at', { ascending: true })
    .limit(20_000)
  if (error) return []
  return (data ?? []).map(row => ({
    lng: row.longitude,
    lat: row.latitude,
    recordedAt: new Date(row.recorded_at).getTime(),
    accuracy: row.accuracy ?? undefined,
  }))
}

export async function loadSyncedDiscovery(expectedUserId: string): Promise<SyncedDiscovery> {
  const user = await currentUser()
  if (!supabase || !user || user.id !== expectedUserId) return { points: [], cells: [] }
  const [walkPoints, legacyPoints, cells] = await Promise.all([
    loadRemoteWalkPoints(),
    loadLegacyPoints(),
    loadRemoteCells(),
  ])
  return {
    points: walkPoints.length ? walkPoints : legacyPoints,
    cells: mergeDiscoveryCells(cells, discoveryCellsFromPoints(walkPoints), discoveryCellsFromPoints(legacyPoints)),
  }
}
