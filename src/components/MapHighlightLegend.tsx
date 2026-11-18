import { t, useAppTranslation } from "../i18n";
import type { MapReward } from "../goalRewards";
import { discoveryHighlightColor, journeyHighlightColor } from "../mapRewardPalette";
import type { Coordinate } from "../types";

type Props = {
  reward: MapReward;
  points: readonly Coordinate[];
  newGroundSegments: readonly Coordinate[][];
};

export function MapHighlightLegend({ reward, points, newGroundSegments }: Props) {
  useAppTranslation();
  if (points.length === 0 && newGroundSegments.length === 0) return null;
  return (
    <aside className="map-highlight-legend" data-testid="map-highlight-legend" aria-label={t("Map legend")}>
      {points.length > 0 && <span><i className="map-highlight-legend__journey" style={{ background: journeyHighlightColor(reward) }} aria-hidden="true" />{t("Travelled")}</span>}
      {newGroundSegments.length > 0 && <span><i className="map-highlight-legend__new" style={{ background: reward === "paper" ? "transparent" : discoveryHighlightColor(reward), borderTop: reward === "paper" ? `2px dashed ${discoveryHighlightColor("paper")}` : undefined }} aria-hidden="true" />{t("New ground")}</span>}
    </aside>
  );
}
