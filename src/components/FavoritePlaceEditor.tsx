import { t, useAppTranslation, currentLanguage } from "../i18n";
import { errorDiagnostic } from "../diagnostics";
import { useEffect, useState } from "react";
import { Clipboard } from "@capacitor/clipboard";
import {
  FAVORITE_PLACE_ICONS,
  fetchFavoritePlaceName,
  favoritePlaceIconVector,
  type FavoritePlace,
  type FavoritePlaceIcon,
} from "../favoritePlaces";
import { DirectionsIcon, XIcon } from "./Icons";

type Props = {
  favorite: FavoritePlace;
  initialMode: "view" | "edit";
  existing: boolean;
  keyboardInset: number;
  onClose: () => void;
  onSave: (favorite: FavoritePlace) => void;
  onDelete: (favorite: FavoritePlace) => void;
  onDirections: (favorite: FavoritePlace) => void;
  onHecateDirections: (favorite: FavoritePlace) => void;
};

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

export function FavoritePlaceEditor({
  favorite,
  initialMode,
  existing,
  keyboardInset,
  onClose,
  onSave,
  onDelete,
  onDirections,
  onHecateDirections,
}: Props) {
  useAppTranslation();
  const [draft, setDraft] = useState(favorite);
  const [mode, setMode] = useState(initialMode);
  const [dateKind, setDateKind] = useState<"created" | "updated">("created");
  const [coordinatesCopied, setCoordinatesCopied] = useState(false);
  const [copyError, setCopyError] = useState("");
  const coordinates = `${draft.lat.toFixed(5)}, ${draft.lng.toFixed(5)}`;
  const shownAt = dateKind === "created" ? draft.createdAt : draft.updatedAt;
  useEffect(() => {
    if (!coordinatesCopied) return;
    const timer = window.setTimeout(() => setCoordinatesCopied(false), 2000);
    return () => window.clearTimeout(timer);
  }, [coordinatesCopied]);

  useEffect(() => {
    if (existing) return;
    const controller = new AbortController();
    void fetchFavoritePlaceName(favorite.lat, favorite.lng, controller.signal)
      .then((name) => {
        if (!name) return;
        setDraft((current) =>
          current.name !== favorite.name ? current : { ...current, name },
        );
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          console.warn("Could not find a name for this saved place", errorDiagnostic(error));
      });
    return () => controller.abort();
  }, [existing, favorite.lat, favorite.lng, favorite.name]);

  return (
    <div
      className={`favorite-editor-backdrop${keyboardInset ? " favorite-editor-backdrop--keyboard" : ""}`}
      role="presentation"
      style={keyboardInset ? { bottom: `${keyboardInset}px` } : undefined}
      onPointerDown={(event) => {
        event.stopPropagation();
      }}
      onClick={(event) => {
        event.stopPropagation();
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="favorite-editor" role="dialog" aria-modal="true" aria-labelledby="favorite-editor-title">
        <header className="favorite-editor__header">
          <button className="favorite-editor__close" type="button" onClick={onClose} aria-label={t("Close saved place editor")}>
            <XIcon size={18} />
          </button>
          <div className="favorite-editor__eyebrow-row">
            <div className="favorite-editor__kind">
              <span className="favorite-editor__place-icon" aria-hidden="true">
                <FavoriteGlyph icon={draft.icon} />
              </span>
              <div className="eyebrow">{existing ? t("Saved place") : t("New place")}</div>
            </div>
            <button type="button" className="favorite-editor__coordinates" data-testid="favorite-copy-coordinates"
              aria-label={t("Copy coordinates {{value0}}", { value0: coordinates })} title={t("Copy coordinates")} onClick={() => {
                void Clipboard.write({ string: coordinates }).then(() => {
                  setCoordinatesCopied(true);
                  setCopyError("");
                }).catch((error) => {
                  console.error("Could not copy saved place coordinates", { error: errorDiagnostic(error) });
                  setCopyError(t("Could not copy coordinates. Please try again."));
                });
              }}>
              <span style={{ visibility: coordinatesCopied ? "hidden" : "visible" }} aria-hidden="true">{coordinates}</span>
              <span role="status" aria-live="polite">{coordinatesCopied ? t("Copied") : ""}</span>
            </button>
          </div>
          <h2 id="favorite-editor-title">
            {draft.name.trim() || t("Save a place")}
          </h2>
          {copyError && <p className="form-message form-message--error" role="alert">{copyError}</p>}
        </header>
        <div className="favorite-editor__body">
          {mode === "view" ? (
            <>
              <div className="favorite-editor__comment-card">
                <p className="favorite-editor__comment">{draft.comment}</p>
              </div>
              <button
                className="favorite-editor__date"
                type="button"
                onClick={() => setDateKind((kind) => kind === "created" ? "updated" : "created")}
                aria-label={t(dateKind === "created" ? "favorite.showCreated" : "favorite.showUpdated")}
              >
                <span>{dateKind === "created" ? t("Created") : t("Updated")}</span>
                <time dateTime={new Date(shownAt).toISOString()}>
                  {new Intl.DateTimeFormat(currentLanguage(), { dateStyle: "medium", timeStyle: "short" }).format(shownAt)}
                </time>
              </button>
            </>
          ) : (
            <>
              <label className="favorite-editor__name">
                <span>{t("Name")}</span>
                <input
                  type="text"
                  maxLength={80}
                  value={draft.name}
                  onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                  placeholder={t("Add a place name")}
                  autoComplete="off"
                />
              </label>
              <div className="favorite-editor__icon-picker" role="group" aria-label={t("Place type")}>
                {FAVORITE_PLACE_ICONS.map((icon) => (
                  <button
                    key={icon.id}
                    type="button"
                    className={draft.icon === icon.id ? "active" : ""}
                    onClick={() => setDraft({ ...draft, icon: icon.id })}
                    onPointerDown={(event) => event.preventDefault()}
                    onMouseDown={(event) => event.preventDefault()}
                    onTouchStart={(event) => event.preventDefault()}
                    onTouchEnd={(event) => {
                      event.preventDefault();
                      setDraft({ ...draft, icon: icon.id });
                    }}
                    aria-label={icon.label}
                    aria-pressed={draft.icon === icon.id}
                    title={icon.label}
                  >
                    <FavoriteGlyph icon={icon.id} />
                    <span>{icon.label}</span>
                  </button>
                ))}
              </div>
              <label className="favorite-editor__note-label" htmlFor="favorite-place-note">{t("What should you remember?")}</label>
              <textarea
                id="favorite-place-note"
                autoFocus
                maxLength={240}
                value={draft.comment}
                onChange={(event) => setDraft({ ...draft, comment: event.target.value })}
                placeholder={t("A quiet courtyard, the best view, come back at sunset…")}
                aria-label={t("Note about this saved place")}
              />
              <div className="favorite-editor__meta"><span>{draft.comment.length}/240</span></div>
            </>
          )}
        </div>
        <div className="favorite-editor__actions">
          {mode === "edit" && existing && (
            <button className="favorite-editor__delete" type="button" onClick={() => onDelete(draft)}>{t("Remove")}</button>
          )}
          {mode === "view" ? (
            <>
              <button className="favorite-editor__directions" type="button" onClick={() => onHecateDirections(draft)}>
                <DirectionsIcon size={18} />  {t("Get directions")} </button>
              <button className="favorite-editor__save" type="button" onClick={() => setMode("edit")}>{t("Update note")}</button>
            </>
          ) : (
            <button
              className="favorite-editor__save"
              type="button"
              onClick={() => onSave(draft)}
              disabled={!draft.name.trim() || !draft.comment.trim()}
            >{t("Save place")}</button>
          )}
        </div>
        {mode === "view" && (
          <button className="favorite-editor__external-directions" type="button" onClick={() => onDirections(draft)}>{t("Or open in other maps")}</button>
        )}
      </section>
    </div>
  );
}
