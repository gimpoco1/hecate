import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Coordinate } from './types'

const STORAGE_KEY = 'hecate:discovery-points:v1'
const LEGACY_STORAGE_KEY = 'unfold:discovery-points:v1'

export function loadLocalPoints(): Coordinate[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_STORAGE_KEY) ?? '[]'
    const parsed = JSON.parse(stored)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveLocalPoints(points: Coordinate[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(points.slice(-20_000)))
}

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const isSyncConfigured = Boolean(supabaseUrl && supabaseKey)
export const supabase: SupabaseClient | null = isSyncConfigured
  ? createClient(supabaseUrl!, supabaseKey!, { auth: { persistSession: true } })
  : null

export async function syncPoints(points: Coordinate[]) {
  if (!supabase || points.length === 0) return
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const rows = points.map(point => ({
    user_id: user.id,
    recorded_at: new Date(point.recordedAt).toISOString(),
    longitude: point.lng,
    latitude: point.lat,
    accuracy: point.accuracy ?? null,
  }))
  await supabase.from('discovery_points').upsert(rows, { onConflict: 'user_id,recorded_at' })
}

export async function loadSyncedPoints(): Promise<Coordinate[]> {
  if (!supabase) return []
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  const { data, error } = await supabase
    .from('discovery_points')
    .select('longitude,latitude,recorded_at,accuracy')
    .order('recorded_at', { ascending: true })
    .limit(20_000)
  if (error) throw error
  return (data ?? []).map(row => ({
    lng: row.longitude,
    lat: row.latitude,
    recordedAt: new Date(row.recorded_at).getTime(),
    accuracy: row.accuracy ?? undefined,
  }))
}
