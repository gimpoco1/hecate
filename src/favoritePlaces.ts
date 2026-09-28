export const FAVORITE_PLACE_ICONS = [
  {
    id: "star",
    label: "General",
    path: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-2.9-5.6 2.9 1.1-6.2L3 9.6l6.2-.9L12 3Z"/>',
  },
  {
    id: "tree",
    label: "Park",
    path: '<path d="M12 3 7 10h3l-4 6h5v5h2v-5h5l-4-6h3l-5-7Z"/>',
  },
  {
    id: "restaurant",
    label: "Restaurant",
    path: '<path d="M4 3v5M7 3v5M10 3v5M4 8a3 3 0 0 0 6 0M7 11v10M16 3c2.5 2 4 5 4 8h-4V3ZM16 11v10"/>',
  },
  {
    id: "cafe",
    label: "Café",
    path: '<path d="M5 8h11v6a5 5 0 0 1-5 5H10a5 5 0 0 1-5-5V8ZM16 10h2a2 2 0 0 1 0 4h-2M8 3v2M12 3v2"/>',
  },
  {
    id: "viewpoint",
    label: "Viewpoint",
    path: '<path d="m3 19 6-10 4 6 2-3 6 7H3ZM7 6a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z"/>',
  },
  {
    id: "landmark",
    label: "Landmark",
    path: '<path d="m3 9 9-5 9 5H3ZM5 11v7M9 11v7M15 11v7M19 11v7M3 20h18"/>',
  },
  {
    id: "shop",
    label: "Shop",
    path: '<path d="M6 8h12l1 13H5L6 8ZM9 9V6a3 3 0 0 1 6 0v3"/>',
  },
  {
    id: "sports",
    label: "Sports",
    path: '<svg height="200px" width="200px" version="1.1" id="Layer_1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 330 330" xml:space="preserve"><g id="SVGRepo_bgCarrier" stroke-width="0"></g><g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g><g id="SVGRepo_iconCarrier"> <path id="XMLID_852_" d="M330,164.994L330,164.994c0-44.072-17.161-85.505-48.324-116.667C250.511,17.163,209.076,0,165,0l0,0l0,0 h-0.001C74.019,0.004,0.001,74.02,0,164.994v0l0,0c0,0.001,0,0.001,0,0.001c0.003,44.075,17.167,85.512,48.331,116.678 C79.496,312.838,120.922,330,164.989,330c0.002,0,0.008,0,0.011,0c90.981,0,165-74.02,165-165.002 C330,164.997,330,164.996,330,164.994L330,164.994z M273.227,245.609c-26.071-22.643-58.829-36.634-93.227-39.81v-25.805h119.163 C296.452,204.406,287.214,226.877,273.227,245.609z M30.83,179.994H150v25.805c-34.419,3.178-67.196,17.189-93.276,39.86 C42.354,226.453,33.459,203.919,30.83,179.994z M56.776,84.387c26.071,22.645,58.829,36.636,93.224,39.813v25.795H30.838 C33.549,125.585,42.788,103.117,56.776,84.387z M180,30.829c26.954,2.961,52.142,13.875,72.793,31.607 C232.169,80.22,207.056,91.136,180,94.085V30.829z M150,94.084c-27.029-2.946-52.12-13.845-72.733-31.601 C97.303,45.313,122.41,33.904,150,30.838V94.084z M150,235.914v63.258c-26.949-2.96-52.137-13.875-72.787-31.609 C97.836,249.779,122.947,238.862,150,235.914z M180,235.914c27.032,2.946,52.124,13.845,72.737,31.601 c-20.037,17.173-45.145,28.583-72.737,31.648V235.914z M180,149.994v-25.795c34.422-3.178,67.203-17.189,93.283-39.861 c14.367,19.203,23.261,41.734,25.888,65.656H180z"></path> </g></svg>',
  },
] as const;

export type FavoritePlaceIcon = (typeof FAVORITE_PLACE_ICONS)[number]["id"];

export type FavoritePlace = {
  id: string;
  lat: number;
  lng: number;
  comment: string;
  icon: FavoritePlaceIcon;
  createdAt: number;
  updatedAt: number;
};

type FavoritePlaceRow = {
  id: string;
  latitude: number;
  longitude: number;
  comment: string;
  icon: string;
  created_at: string;
  updated_at: string;
};

export function isFavoritePlaceIcon(
  value: unknown,
): value is FavoritePlaceIcon {
  return FAVORITE_PLACE_ICONS.some((icon) => icon.id === value);
}

export function favoritePlaceIconPath(iconId: FavoritePlaceIcon) {
  return (
    FAVORITE_PLACE_ICONS.find((icon) => icon.id === iconId)?.path ??
    FAVORITE_PLACE_ICONS[0].path
  );
}

export type FavoritePlaceIconVector = {
  viewBox: string;
  markup: string;
  filled: boolean;
};

export function favoritePlaceIconVector(
  iconId: FavoritePlaceIcon,
): FavoritePlaceIconVector {
  const source = favoritePlaceIconPath(iconId).trim();
  const svg = source.match(/^<svg\b([^>]*)>([\s\S]*)<\/svg>$/i);
  if (!svg) return { viewBox: "0 0 24 24", markup: source, filled: false };

  const viewBox =
    svg[1].match(/\bviewBox=["']([^"']+)["']/i)?.[1] ?? "0 0 24 24";
  const markup = svg[2]
    .replace(
      /<g\b[^>]*id=["']SVGRepo_(?:bgCarrier|tracerCarrier)["'][^>]*>[\s\S]*?<\/g>/gi,
      "",
    )
    .trim();
  const rootUsesStrokeOnly = /\bfill=["']none["']/i.test(svg[1]);
  return { viewBox, markup, filled: !rootUsesStrokeOnly };
}

const STORAGE_VERSION = 1;

function storageKey(userId: string | null) {
  return `hecate:favorite-places:v${STORAGE_VERSION}:${userId ?? "guest"}`;
}

function isFavoritePlace(value: unknown): value is FavoritePlace {
  if (!value || typeof value !== "object") return false;
  const place = value as Partial<FavoritePlace>;
  return (
    typeof place.id === "string" &&
    typeof place.lat === "number" &&
    Number.isFinite(place.lat) &&
    place.lat >= -90 &&
    place.lat <= 90 &&
    typeof place.lng === "number" &&
    Number.isFinite(place.lng) &&
    place.lng >= -180 &&
    place.lng <= 180 &&
    typeof place.comment === "string" &&
    (place.icon === undefined || isFavoritePlaceIcon(place.icon)) &&
    typeof place.createdAt === "number" &&
    typeof place.updatedAt === "number"
  );
}

export function favoritePlacesFromUnknown(value: unknown): FavoritePlace[] {
  return Array.isArray(value)
    ? value
        .filter(isFavoritePlace)
        .map((place) => ({ ...place, icon: place.icon ?? "star" }))
    : [];
}

export function loadFavoritePlaces(userId: string | null): FavoritePlace[] {
  try {
    const parsed: unknown = JSON.parse(
      localStorage.getItem(storageKey(userId)) ?? "[]",
    );
    return favoritePlacesFromUnknown(parsed);
  } catch {
    return [];
  }
}

export function saveFavoritePlaces(
  userId: string | null,
  places: FavoritePlace[],
) {
  localStorage.setItem(storageKey(userId), JSON.stringify(places));
}

function favoritePlaceFromRow(row: FavoritePlaceRow): FavoritePlace | null {
  const place = {
    id: row.id,
    lat: Number(row.latitude),
    lng: Number(row.longitude),
    comment: row.comment,
    icon: row.icon,
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
  };
  return isFavoritePlace(place) ? place : null;
}

function favoritePlaceToRow(place: FavoritePlace, userId: string) {
  return {
    id: place.id,
    user_id: userId,
    latitude: place.lat,
    longitude: place.lng,
    comment: place.comment,
    icon: place.icon,
    created_at: new Date(place.createdAt).toISOString(),
    updated_at: new Date(place.updatedAt).toISOString(),
  };
}

export async function loadFavoritePlacesFromDatabase(
  client: import("@supabase/supabase-js").SupabaseClient,
  userId: string,
) {
  const { data, error } = await client
    .from("favorite_places")
    .select("id,latitude,longitude,comment,icon,created_at,updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).flatMap((row) => {
    const place = favoritePlaceFromRow(row as FavoritePlaceRow);
    return place ? [place] : [];
  });
}

export async function upsertFavoritePlacesInDatabase(
  client: import("@supabase/supabase-js").SupabaseClient,
  userId: string,
  places: FavoritePlace[],
) {
  if (!places.length) return;
  const { error } = await client
    .from("favorite_places")
    .upsert(places.map((place) => favoritePlaceToRow(place, userId)), {
      onConflict: "user_id,id",
    });
  if (error) throw error;
}

export async function deleteFavoritePlacesFromDatabase(
  client: import("@supabase/supabase-js").SupabaseClient,
  userId: string,
  placeIds: string[],
) {
  if (!placeIds.length) return;
  const { error } = await client
    .from("favorite_places")
    .delete()
    .eq("user_id", userId)
    .in("id", placeIds);
  if (error) throw error;
}

export function createFavoritePlace(lat: number, lng: number): FavoritePlace {
  const now = Date.now();
  const id =
    typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `favorite-${now}-${Math.random().toString(36).slice(2)}`;
  return {
    id,
    lat,
    lng,
    comment: "",
    icon: "star",
    createdAt: now,
    updatedAt: now,
  };
}

export function favoriteDirectionsUrl(
  provider: "apple" | "google",
  place: Pick<FavoritePlace, "lat" | "lng">,
) {
  const destination = `${place.lat},${place.lng}`;
  return provider === "apple"
    ? `https://maps.apple.com/?daddr=${encodeURIComponent(destination)}&dirflg=w`
    : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}&travelmode=walking`;
}

export function favoriteNativeDirectionsUrl(
  provider: "apple" | "google",
  place: Pick<FavoritePlace, "lat" | "lng">,
) {
  const destination = `${place.lat},${place.lng}`;
  return provider === "apple"
    ? `maps://?daddr=${encodeURIComponent(destination)}&dirflg=w`
    : `comgooglemaps://?daddr=${encodeURIComponent(destination)}&directionsmode=walking`;
}
