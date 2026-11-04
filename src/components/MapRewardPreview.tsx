import { useRef } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import { t } from "../i18n";
import type { MapReward } from "../goalRewards";
import type { TranslationKey } from "../i18n";
import type { Coordinate, DiscoveryCell } from "../types";
import { MAP_REWARD_PALETTES } from "../mapRewardPalette";
import { DiscoveryMap } from "./DiscoveryMap";

const EMPTY_CELLS: DiscoveryCell[] = [];
const EMPTY_SEGMENTS: Coordinate[][] = [];
const PREVIEW_ROUTE: Coordinate[] = [
  { lng: 2.1687, lat: 41.3884, recordedAt: 1000 },
  { lng: 2.1696, lat: 41.3891, recordedAt: 2000 },
  { lng: 2.1705, lat: 41.3884, recordedAt: 3000 },
  { lng: 2.1724, lat: 41.3898, recordedAt: 4000 },
];
const PREVIEW_BOUNDS: [[number, number], [number, number]] = [[2.1675, 41.3878], [2.1735, 41.3905]];
function onPreviewZoomChange(): void {}

/** Render the production map and journey overlay instead of an illustrative approximation. */
export function MapRewardPreview({ reward }: { reward: { id: MapReward; title: TranslationKey } }) {
  const mapRef = useRef<MapLibreMap | null>(null);
  const palette = reward.id === "standard" ? null : MAP_REWARD_PALETTES[reward.id];
  const previewId = `reward-preview-${reward.id}`;
  return <div id={previewId} className="achievement-reward__expanded" data-testid={previewId} style={palette ? { background: palette.land, color: palette.text } : undefined}>
    <div className="map-appearance-live-preview">
      <DiscoveryMap
        reward={reward.id}
        mode={reward.id === "paper" || reward.id === "midnight" ? "discover" : "map"}
        points={PREVIEW_ROUTE}
        cells={EMPTY_CELLS}
        highlightedPoints={PREVIEW_ROUTE}
        highlightedNewGroundSegments={EMPTY_SEGMENTS}
        navigationFollowing={false}
        onZoomChange={onPreviewZoomChange}
        mapRef={mapRef}
        initialBounds={PREVIEW_BOUNDS}
      />
    </div>
    <span>{t("Appearance preview")} · {t(reward.title)}</span>
  </div>;
}
