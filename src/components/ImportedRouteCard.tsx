import { currentLanguage, formatNumber, t, useAppTranslation } from "../i18n";
import type { GpxImportedRoute } from "./SyncSheet";
import { RouteIcon } from "./Icons";

type Props = {
  route: GpxImportedRoute;
  onShowMap: (routeId: string) => void;
};

function formatDistance(distanceKm: number): string {
  return distanceKm < 1 ? `${Math.round(distanceKm * 1000)} m` : `${formatNumber(distanceKm, distanceKm < 10 ? 2 : 1)} km`;
}

export function ImportedRouteCard({ route, onShowMap }: Props) {
  useAppTranslation();
  const addedAt = new Intl.DateTimeFormat(currentLanguage(), { dateStyle: "medium", timeStyle: "short" }).format(route.addedAt);
  return <li className="collection-card imported-route-card" data-testid={`gpx-route-${route.id}`}>
    <header className="imported-route-card__header">
      <h3>{route.title}</h3>
      <time dateTime={new Date(route.addedAt).toISOString()}>{t("Added {{value0}}", { value0: addedAt })}</time>
    </header>
    <dl className="collection-card__metrics">
      <div><dt>{t("Route distance")}</dt><dd>{formatDistance(route.addedKm)}</dd></div>
      {route.newGroundKm !== undefined && <div><dt>{t("New ground")}</dt><dd>{formatDistance(route.newGroundKm)}</dd></div>}
    </dl>
    <div className="collection-card__actions">
      <button type="button" className="collection-card__primary" data-testid={`gpx-route-map-${route.id}`}
        aria-label={t("Show imported route {{value0}} on the map", { value0: route.title })} onClick={() => onShowMap(route.id)}>
        <RouteIcon size={16} strokeWidth={1.8} />{t("View on map")}
      </button>
    </div>
  </li>;
}
