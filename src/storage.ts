import { t } from "./i18n";
import { loadStoredWalkPoints, loadStoredCells, loadStoredCities } from "./discoveryStorage";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { discoveryCellsFromPoints, mergeDiscoveryCells } from "./geo";
import type { CityBoundary } from "./city";
import type { Coordinate, DiscoveryCell, PendingWalk } from "./types";

type SyncedDiscovery = { points: Coordinate[]; cells: DiscoveryCell[] };

export async function loadDiscoveredCities(expectedUserId: string): Promise<CityBoundary[]> {
  if (!supabase || !await hasExpectedSession(expectedUserId)) return [];
  return loadStoredCities(supabase);
}

export async function syncDiscoveredCity(city: CityBoundary, expectedUserId: string) {
  if (!supabase) return;
  if (!await hasExpectedSession(expectedUserId)) return;
  const now = new Date().toISOString();
  const { error } = await supabase.from("discovered_cities").upsert({
    user_id: expectedUserId,
    city_id: city.id,
    name: city.name,
    geometry: city.geometry,
    first_discovered_at: city.firstDiscoveredAt ? new Date(city.firstDiscoveredAt).toISOString() : now,
    last_discovered_at: city.lastDiscoveredAt ? new Date(city.lastDiscoveredAt).toISOString() : now,
  }, { onConflict: "user_id,city_id" });
  if (error) throw error;
}

export async function replaceDiscoveredCities(oldCityIds: string[], city: CityBoundary, expectedUserId: string) {
  const obsoleteIds = oldCityIds.filter(id => id !== city.id);
  if (!supabase || !obsoleteIds.length || !await hasExpectedSession(expectedUserId)) return;
  await syncDiscoveredCity(city, expectedUserId);
  if (!await hasExpectedSession(expectedUserId)) return;
  const { error } = await supabase.from("discovered_cities")
    .delete()
    .eq("user_id", expectedUserId)
    .in("city_id", obsoleteIds);
  if (error) throw error;
}

const LEGACY_DISCOVERY_KEYS = [
  "hecate:discovery-points:v1",
  "hecate:discovery-cells:v1",
  "hecate:active-walk:v1",
  "hecate:walk-outbox:v1",
  "hecate:city-boundary:v1",
  "unfold:discovery-points:v1",
];

// Remove discovery data written by versions that predated account-only storage.
export function purgeLegacyDiscoveryCache() {
  try {
    LEGACY_DISCOVERY_KEYS.forEach(key => localStorage.removeItem(key));
  } catch {
    // Some privacy modes disable Web Storage; account-backed discovery still works.
  }
}

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isSyncConfigured = Boolean(supabaseUrl && supabaseKey);
export const supabase: SupabaseClient | null = isSyncConfigured
  ? createClient(supabaseUrl!, supabaseKey!, { auth: { persistSession: true, flowType: "pkce", detectSessionInUrl: false } })
  : null;

async function hasExpectedSession(expectedUserId: string) {
  if (!supabase) return false;
  // The database still authorizes every request with RLS. For client-side
  // account-race protection, the locally restored session is sufficient and
  // avoids an extra /auth/v1/user request before each data operation.
  const { data: { session }, error } = await supabase.auth.getSession();
  return !error && session?.user.id === expectedUserId;
}

let uploadedCellUser: string | null = null;
let uploadedCellKeys = new Set<string>();

function rememberSyncedCells(userId: string, cells: DiscoveryCell[]) {
  if (uploadedCellUser !== userId) {
    uploadedCellUser = userId;
    uploadedCellKeys = new Set();
  }
  cells.forEach(cell => uploadedCellKeys.add(`${cell.z}/${cell.x}/${cell.y}`));
}

export async function syncDiscoveryCells(cells: DiscoveryCell[], expectedUserId: string) {
  if (!supabase || cells.length === 0) return;
  if (!await hasExpectedSession(expectedUserId)) return;
  if (uploadedCellUser !== expectedUserId) rememberSyncedCells(expectedUserId, []);

  const unsynced = cells.filter(cell => !uploadedCellKeys.has(`${cell.z}/${cell.x}/${cell.y}`));
  for (let offset = 0; offset < unsynced.length; offset += 1_000) {
    const batch = unsynced.slice(offset, offset + 1_000);
    const rows = batch.map(cell => ({
      user_id: expectedUserId,
      cell_z: cell.z,
      cell_x: cell.x,
      cell_y: cell.y,
      first_discovered_at: new Date(cell.discoveredAt).toISOString(),
    }));
    const { error } = await supabase.from("discovery_cells").upsert(rows, {
      onConflict: "user_id,cell_z,cell_x,cell_y",
      ignoreDuplicates: true,
    });
    if (error) throw error;
    batch.forEach(cell => uploadedCellKeys.add(`${cell.z}/${cell.x}/${cell.y}`));
  }
}

export async function saveCompletedWalk(walk: PendingWalk, expectedUserId: string) {
  if (!supabase || walk.points.length < 2) return;
  if (!await hasExpectedSession(expectedUserId)) throw new Error(t("The signed-in account changed before the walk could be saved"));
  const { error } = await supabase.rpc("save_walk", {
    p_walk_id: walk.id,
    p_started_at: new Date(walk.startedAt).toISOString(),
    p_finished_at: new Date(walk.finishedAt).toISOString(),
    p_coordinates: walk.points.map(point => [point.lng, point.lat]),
    p_point_count: walk.points.length,
    p_achievement_eligible: walk.achievementEligible !== false,
  });
  if (error) throw error;
}

export async function loadSyncedDiscovery(expectedUserId: string): Promise<SyncedDiscovery> {
  if (!supabase || !await hasExpectedSession(expectedUserId)) return { points: [], cells: [] };
  const [walkPoints, cells] = await Promise.all([
    loadStoredWalkPoints(supabase),
    loadStoredCells(supabase),
  ]);
  rememberSyncedCells(expectedUserId, cells);
  return {
    points: walkPoints,
    cells: mergeDiscoveryCells(cells, discoveryCellsFromPoints(walkPoints)),
  };
}
