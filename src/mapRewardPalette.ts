import type { ColorTheme } from "./appearance";
import type { MapReward } from "./goalRewards";
import type { LineLayerSpecification } from "maplibre-gl";

type MapPalette = {
  theme: ColorTheme;
  land: string;
  water: string;
  park: string;
  building: string;
  road: string;
  casing: string;
  text: string;
  halo: string;
  route: string;
  completedRoute: string;
  discovery: string;
  routeHalo: string;
};

/** Shared by the base map, navigation and appearance previews. */
export const MAP_REWARD_PALETTES: Record<Exclude<MapReward, "standard">, MapPalette> = {
  paper: { theme: "light", land: "#ffffff", water: "#ededed", park: "#f7f7f7", building: "#f5f5f5", road: "#cccccc", casing: "#ffffff", text: "#444444", halo: "#ffffff", route: "#000000", completedRoute: "#656565", discovery: "#555555", routeHalo: "#ffffff" },
  parchment: { theme: "light", land: "#f4ecd8", water: "#b7c7c5", park: "#cccbb0", building: "#c9bca3", road: "#786c59", casing: "#e0d5bc", text: "#302b25", halo: "#f4ecd8", route: "#8d3412", completedRoute: "#88664f", discovery: "#3c641d", routeHalo: "#fff8e9" },
  midnight: { theme: "dark", land: "#17132d", water: "#090b1c", park: "#232343", building: "#322b52", road: "#746396", casing: "#100d23", text: "#f2dfb3", halo: "#17132d", route: "#ffab3d", completedRoute: "#aa7847", discovery: "#d8bfff", routeHalo: "#0a0818" },
  woodland: { theme: "light", land: "#edf0df", water: "#a8c8bd", park: "#c0d2ad", building: "#d5d8bd", road: "#8b9d7c", casing: "#f5f5e8", text: "#284b3c", halo: "#edf0df", route: "#8c291f", completedRoute: "#876359", discovery: "#335826", routeHalo: "#fff8e9" },
  tidal: { theme: "light", land: "#e8f1f1", water: "#9cc9d8", park: "#c8dfcf", building: "#cedde2", road: "#7b9da9", casing: "#f4faf8", text: "#234954", halo: "#e8f1f1", route: "#842052", completedRoute: "#846076", discovery: "#155e70", routeHalo: "#fff5fa" },
  ember: { theme: "dark", land: "#30262d", water: "#181c2c", park: "#3c383b", building: "#48343b", road: "#74505a", casing: "#261f2a", text: "#efd5c4", halo: "#30262d", route: "#ffbf69", completedRoute: "#ab805c", discovery: "#d9f26a", routeHalo: "#17121a" },
  aurora: { theme: "dark", land: "#102e32", water: "#061d27", park: "#164a44", building: "#245158", road: "#65b5ad", casing: "#0b262b", text: "#dcf6e8", halo: "#102e32", route: "#ffab98", completedRoute: "#ba8f87", discovery: "#a3f5ce", routeHalo: "#071d24" },
  frontier: { theme: "light", land: "#faf0df", water: "#b2d4d7", park: "#d9d4a8", building: "#e0c8a9", road: "#b89770", casing: "#fff8ed", text: "#4d382a", halo: "#faf0df", route: "#154e91", completedRoute: "#62768e", discovery: "#8b381b", routeHalo: "#fffaf0" },
};

export function mapRewardTheme(reward: MapReward, appTheme: ColorTheme): ColorTheme {
  return reward === "standard" ? appTheme : MAP_REWARD_PALETTES[reward].theme;
}

export function rewardMapColor(reward: Exclude<MapReward, "standard">, layerId: string, property: string): string {
  const palette = MAP_REWARD_PALETTES[reward];
  const id = layerId.toLowerCase();
  if (property === "text-halo-color") return palette.halo;
  if (property === "text-color" || property === "icon-color") return palette.text;
  if (/water|ocean|river|stream/.test(id)) return palette.water;
  if (/park|wood|grass|forest|landcover|pitch|cemetery/.test(id)) return palette.park;
  if (/building/.test(id)) return palette.building;
  if (/casing/.test(id)) return palette.casing;
  if (/road|highway|street|bridge|tunnel|rail|boundary|border|motorway|trunk/.test(id)) return palette.road;
  return palette.land;
}

export function navigationRoutePaint(reward: MapReward, completedFraction: number): NonNullable<LineLayerSpecification["paint"]> {
  const palette = reward === "standard" ? { route: "#4f6b14", completedRoute: "#6c7b52" } : MAP_REWARD_PALETTES[reward];
  return {
    "line-color": palette.route,
    "line-width": 6,
    "line-gradient": ["step", ["line-progress"], palette.completedRoute, completedFraction, palette.route],
  };
}

export function navigationRouteHalo(reward: MapReward): string {
  return reward === "standard" ? "#f7f4ed" : MAP_REWARD_PALETTES[reward].routeHalo;
}

export function journeyHighlightColor(reward: MapReward): string {
  return reward === "standard" ? "#566574" : MAP_REWARD_PALETTES[reward].route;
}

export function discoveryHighlightColor(reward: MapReward): string {
  return reward === "standard" ? "#557615" : MAP_REWARD_PALETTES[reward].discovery;
}
