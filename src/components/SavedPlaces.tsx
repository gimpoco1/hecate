import { t, useAppTranslation, currentLanguage } from "../i18n";
import { errorDiagnostic } from "../diagnostics";
import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import type { Map as MapLibreMap } from "maplibre-gl";
import mapWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import {
  FAVORITE_PLACE_ICONS,
  favoritePlaceIconVector,
  type FavoritePlace,
  type FavoritePlaceIcon,
} from "../favoritePlaces";
import { loadMapStyle } from "../mapStyle";
import { useAppearance } from "../appearance";
import { applyMapAppearance } from "../mapAppearance";
import { ArrowLeftIcon, ChevronIcon, SaveIcon, XIcon } from "./Icons";

maplibregl.setWorkerUrl(mapWorkerUrl);

type FavoriteGroup = (typeof FAVORITE_PLACE_ICONS)[number] & {
  places: FavoritePlace[];
};

type SavedPlacesSheetProps = {
  open: boolean;
  favoritePlaces: FavoritePlace[];
  onFavoriteSelect: (favorite: FavoritePlace) => void;
  onFavoriteDelete: (favorite: FavoritePlace) => void;
  onBack: () => void;
  onClose: () => void;
};

function favoriteGroupsForPlaces(favoritePlaces: FavoritePlace[]): FavoriteGroup[] {
  return FAVORITE_PLACE_ICONS.flatMap((category) => {
    const places = favoritePlaces
      .filter((place) => place.icon === category.id)
      .sort((first, second) => first.name.localeCompare(second.name));
    return places.length ? [{ ...category, places }] : [];
  });
}

function FavoriteGlyph({ icon }: { icon: FavoritePlaceIcon }) {
  useAppTranslation();
  const vector = favoritePlaceIconVector(icon);
  return (
    <svg
      className={vector.filled ? "favorite-icon--filled" : undefined}
      viewBox={vector.viewBox}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: vector.markup }}
    />
  );
}

function mapPreviewErrorMessage(error: unknown): string {
  return error instanceof Error
    ? t("Map preview unavailable: {{value0}}", { value0: error.message })
    : t("Map preview unavailable because the map style could not be loaded.");
}

function formatSavedAt(timestamp: number): string {
  return new Intl.DateTimeFormat(currentLanguage(), {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(timestamp);
}

function collapseMapAttribution(container: HTMLDivElement): void {
  container
    .querySelector(".maplibregl-ctrl-attrib")
    ?.classList.remove("maplibregl-compact-show");
}

function SavedPlaceMapPreview({ place }: { place: FavoritePlace }) {
  useAppTranslation();
  const { theme } = useAppearance();
  const themeRef = useRef(theme);
  themeRef.current = theme;
  const baseStyleRef = useRef<maplibregl.StyleSpecification | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  useEffect(() => {
    if (mapRef.current && baseStyleRef.current) applyMapAppearance(mapRef.current, baseStyleRef.current, theme);
  }, [theme]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const controller = new AbortController();
    setErrorMessage(null);

    void loadMapStyle(controller.signal)
      .then((style) => {
        if (controller.signal.aborted) return;
        const map = new maplibregl.Map({
          container,
          style,
          center: [place.lng, place.lat],
          zoom: 15.5,
          pitch: 0,
          bearing: 0,
          interactive: false,
          attributionControl: false,
          renderWorldCopies: false,
          fadeDuration: 0,
        });
        mapRef.current = map;
        baseStyleRef.current = style;
        map.once("style.load", () => applyMapAppearance(map, style, themeRef.current));
        map.addControl(
          new maplibregl.AttributionControl({ compact: true }),
          "bottom-left",
        );
        map.once("idle", () => collapseMapAttribution(container));
        map.on("error", (event) => {
          console.error("Saved place map rendering failed", { placeId: place.id, error: errorDiagnostic(event.error) });
        });
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        console.error("Saved place map preview failed", { placeId: place.id, error: errorDiagnostic(error) });
        setErrorMessage(mapPreviewErrorMessage(error));
      });

    return () => {
      controller.abort();
      baseStyleRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [place.id, place.lat, place.lng]);

  if (errorMessage) {
    return (
      <div className="saved-place-map-error" role="status">
        {errorMessage}
      </div>
    );
  }

  return (
    <div className="saved-place-map-preview" aria-label={t("Map preview of {{value0}}", { value0: place.name })}>
      <div ref={containerRef} className="saved-place-map-preview__map" />
      <span className="saved-place-map-preview__marker" aria-hidden="true">
        <FavoriteGlyph icon={place.icon} />
      </span>
    </div>
  );
}

export function SavedPlacesSheet({
  open,
  favoritePlaces,
  onFavoriteSelect,
  onFavoriteDelete,
  onBack,
  onClose,
}: SavedPlacesSheetProps) {
  useAppTranslation();
  const [selectedCategoryId, setSelectedCategoryId] =
    useState<FavoritePlaceIcon | null>(null);
  const [expandedPlaceId, setExpandedPlaceId] = useState<string | null>(null);
  const [confirmingRemovalId, setConfirmingRemovalId] = useState<string | null>(
    null,
  );
  if (!open) return null;

  const groups = favoriteGroupsForPlaces(favoritePlaces);
  const activeCategoryId = groups.some(
    (group) => group.id === selectedCategoryId,
  )
    ? selectedCategoryId
    : (groups[0]?.id ?? null);
  const activeGroup = groups.find((group) => group.id === activeCategoryId);

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <section
        className="sheet saved-places-sheet"
        onClick={(event) => event.stopPropagation()}
        aria-modal="true"
        role="dialog"
        aria-labelledby="saved-places-title"
      >
        <button
          className="icon-button walking-stats-back"
          type="button"
          onClick={onBack}
          aria-label={t("Back to profile")}
        >
          <ArrowLeftIcon />
        </button>
        <button
          className="icon-button sheet__close"
          type="button"
          onClick={onClose}
          aria-label={t("Close saved places")}
        >
          <XIcon />
        </button>
        <div className="eyebrow">{t("Your collection")}</div>
        <h2 id="saved-places-title">{t("Saved places")}</h2>
        <p>{t("Keep your favourite places organised and return to them on the map.")}</p>

        <section className="saved-places-overview" aria-label={t("Saved places summary")}>
          <span>
            <strong>{favoritePlaces.length}</strong>
            <small>{favoritePlaces.length === 1 ? t("Saved place") : t("Saved places")}</small>
          </span>
          <span>
            <strong>{groups.length}</strong>
            <small>{t("collectionLabel", { count: groups.length })}</small>
          </span>
        </section>

        {groups.length === 0 ? (
          <div className="saved-places-empty">
            <span aria-hidden="true">
              <SaveIcon size={22} strokeWidth={2} />
            </span>
            <strong>{t("No saved places yet")}</strong>
            <p>{t("Save a place from the map and it will appear here.")}</p>
          </div>
        ) : (
          <section className="saved-places-collection" aria-label={t("Saved place collections")}>
            <div className="account-favorites__categories">
              {groups.map((group) => (
                <button
                  key={group.id}
                  type="button"
                  className={activeCategoryId === group.id ? "active" : ""}
                  aria-pressed={activeCategoryId === group.id}
                  onClick={() => {
                    setSelectedCategoryId(group.id);
                    setExpandedPlaceId(null);
                    setConfirmingRemovalId(null);
                  }}
                >
                  <span className="account-favorites__category-icon">
                    <FavoriteGlyph icon={group.id} />
                  </span>
                  <strong>{group.label}</strong>
                  <small>{group.places.length}</small>
                </button>
              ))}
            </div>
            {activeGroup && (
              <div className="saved-places-list">
                {activeGroup.places.map((place) => (
                  <article className="saved-place-row" key={place.id}>
                    <button
                      className="saved-place-row__heading"
                      type="button"
                      aria-expanded={expandedPlaceId === place.id}
                      aria-controls={`saved-place-details-${place.id}`}
                      onClick={() => {
                        setConfirmingRemovalId(null);
                        setExpandedPlaceId((current) =>
                          current === place.id ? null : place.id,
                        );
                      }}
                    >
                      <span>
                        <strong>{place.name}</strong>
                        <small>{place.comment}</small>
                      </span>
                      <ChevronIcon size={16} strokeWidth={2.3} />
                    </button>
                    {expandedPlaceId === place.id && (
                      <div
                        className="saved-place-row__details"
                        id={`saved-place-details-${place.id}`}
                      >
                        <SavedPlaceMapPreview place={place} />
                        <p className="saved-place-row__saved-at">
                          {t("Saved")}{" "}
                          <time dateTime={new Date(place.createdAt).toISOString()}>
                            {formatSavedAt(place.createdAt)}
                          </time>
                        </p>
                        {confirmingRemovalId === place.id ? (
                          <div
                            className="saved-place-removal-confirmation"
                            role="alertdialog"
                            aria-labelledby={`saved-place-removal-title-${place.id}`}
                            aria-describedby={`saved-place-removal-description-${place.id}`}
                          >
                            <span>
                              <strong
                                id={`saved-place-removal-title-${place.id}`}
                              >{t("Remove this place?")}</strong>
                              <small
                                id={`saved-place-removal-description-${place.id}`}
                              >{t("This cannot be undone.")}</small>
                            </span>
                            <span>
                              <button
                                type="button"
                                onClick={() => setConfirmingRemovalId(null)}
                              >{t("Cancel")}</button>
                              <button
                                type="button"
                                className="saved-place-removal-confirmation__confirm"
                                onClick={() => onFavoriteDelete(place)}
                              >{t("Remove")}</button>
                            </span>
                          </div>
                        ) : (
                          <div className="saved-place-row__actions">
                            <button
                              type="button"
                              className="saved-place-row__remove"
                              onClick={() => setConfirmingRemovalId(place.id)}
                            >{t("Remove")}</button>
                            <button
                              type="button"
                              onClick={() => onFavoriteSelect(place)}
                            >{t("Show on map")}</button>
                          </div>
                        )}
                      </div>
                    )}
                  </article>
                ))}
              </div>
            )}
          </section>
        )}
      </section>
    </div>
  );
}
