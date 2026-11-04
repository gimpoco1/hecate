import { expect, it } from "vitest";
import { MAP_REWARDS } from "./goalRewards";
import { MAP_REWARD_PALETTES, journeyHighlightColor, discoveryHighlightColor, mapRewardTheme, navigationRouteHalo, navigationRoutePaint, rewardMapColor } from "./mapRewardPalette";

it("uses Midnight Atlas orange in the active navigation line and progress gradient", () => {
  const paint = navigationRoutePaint("midnight", 0.4);
  expect(paint["line-color"]).toBe("#ffab3d");
  expect(paint["line-gradient"]).toEqual(["step", ["line-progress"], "#aa7847", 0.4, "#ffab3d"]);
});

it("uses each preview palette for map layers, navigation and route halos", () => {
  for (const { id } of MAP_REWARDS) {
    const palette = MAP_REWARD_PALETTES[id];
    expect(rewardMapColor(id, "background", "background-color")).toBe(palette.land);
    expect(rewardMapColor(id, "water", "fill-color")).toBe(palette.water);
    expect(rewardMapColor(id, "building", "fill-color")).toBe(palette.building);
    expect(rewardMapColor(id, "road", "line-color")).toBe(palette.road);
    expect(rewardMapColor(id, "labels", "text-color")).toBe(palette.text);
    expect(navigationRoutePaint(id, 0)["line-color"]).toBe(palette.route);
    expect(navigationRouteHalo(id)).toBe(palette.routeHalo);
    expect(mapRewardTheme(id, "light")).toBe(palette.theme);
    expect(mapRewardTheme(id, "dark")).toBe(palette.theme);
  }
});

it("restores standard navigation colors and follows the app theme for the standard map", () => {
  expect(navigationRoutePaint("standard", 0.7)["line-gradient"]).toEqual(["step", ["line-progress"], "#6c7b52", 0.7, "#4f6b14"]);
  expect(navigationRouteHalo("standard")).toBe("#f7f4ed");
  expect(mapRewardTheme("standard", "dark")).toBe("dark");
  expect(mapRewardTheme("standard", "light")).toBe("light");
});

it("matches the travelled legend to every appearance's rendered journey color", () => {
  expect(journeyHighlightColor("standard")).toBe("#566574");
  for (const { id } of MAP_REWARDS) {
    expect(journeyHighlightColor(id)).toBe(navigationRoutePaint(id, 0)["line-color"]);
  }
  expect(discoveryHighlightColor("paper")).toBe("#555555");
  expect(discoveryHighlightColor("standard")).toBe("#557615");
});

it("keeps the original warm appearance separate from the monochrome paper treatment", () => {
  expect(MAP_REWARD_PALETTES.parchment.route).toBe("#8d3412");
  expect(MAP_REWARD_PALETTES.parchment.land).toBe("#f4ecd8");
  expect(MAP_REWARD_PALETTES.paper.route).toBe("#000000");
});

function luminance(hex: string): number {
  const channels = [1, 3, 5].map(offset => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255).map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function contrast(first: string, second: string): number {
  const values = [luminance(first), luminance(second)];
  return (Math.max(...values) + 0.05) / (Math.min(...values) + 0.05);
}

it("keeps route and discovery strokes distinct from their halos in every reward appearance", () => {
  expect(contrast("#4f6b14", navigationRouteHalo("standard"))).toBeGreaterThanOrEqual(4.5);
  expect(contrast(journeyHighlightColor("standard"), navigationRouteHalo("standard"))).toBeGreaterThanOrEqual(4.5);
  for (const { id } of MAP_REWARDS) {
    const palette = MAP_REWARD_PALETTES[id];
    expect(contrast(palette.route, palette.routeHalo), id).toBeGreaterThanOrEqual(4.5);
    expect(contrast(palette.discovery, palette.routeHalo), id).toBeGreaterThanOrEqual(3);
    expect(contrast(palette.completedRoute, palette.land), id).toBeGreaterThanOrEqual(3);
  }
});

it("uses a pure white paper surface, neutral base colors and black navigation", () => {
  const palette = MAP_REWARD_PALETTES.paper;
  expect(palette.land).toBe("#ffffff");
  expect(palette.route).toBe("#000000");
  for (const color of [palette.water, palette.park, palette.building, palette.road, palette.text, palette.discovery]) {
    expect(color.slice(1, 3)).toBe(color.slice(3, 5));
    expect(color.slice(3, 5)).toBe(color.slice(5, 7));
  }
});
