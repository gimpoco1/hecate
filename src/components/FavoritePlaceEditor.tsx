import { useEffect, useState } from "react";
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
};

function FavoriteGlyph({ icon }: { icon: FavoritePlaceIcon }) {
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
}: Props) {
  const [draft, setDraft] = useState(favorite);
  const [mode, setMode] = useState(initialMode);
  const [dateKind, setDateKind] = useState<"created" | "updated">("created");
  const shownAt = dateKind === "created" ? draft.createdAt : draft.updatedAt;

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
          console.warn("Could not find a name for this saved place", error);
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
          <button className="favorite-editor__close" type="button" onClick={onClose} aria-label="Close saved place editor">
            <XIcon size={18} />
          </button>
          <div className="favorite-editor__eyebrow-row">
            <div className="favorite-editor__kind">
              <span className="favorite-editor__place-icon" aria-hidden="true">
                <FavoriteGlyph icon={draft.icon} />
              </span>
              <div className="eyebrow">{existing ? "Saved place" : "New place"}</div>
            </div>
            <span>{draft.lat.toFixed(5)}, {draft.lng.toFixed(5)}</span>
          </div>
          <h2 id="favorite-editor-title">
            {draft.name.trim() || "Save a place"}
          </h2>
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
              aria-label={`Showing ${dateKind} date. Tap to show ${dateKind === "created" ? "updated" : "created"} date.`}
            >
              <span>{dateKind === "created" ? "Created" : "Updated"}</span>
              <time dateTime={new Date(shownAt).toISOString()}>
                {new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(shownAt)}
              </time>
            </button>
          </>
          ) : (
          <>
            <label className="favorite-editor__name">
              <span>Name</span>
              <input
                type="text"
                maxLength={80}
                value={draft.name}
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                placeholder="Add a place name"
                autoComplete="off"
              />
            </label>
            <div className="favorite-editor__icon-picker" role="group" aria-label="Place type">
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
            <label className="favorite-editor__note-label" htmlFor="favorite-place-note">What should you remember?</label>
            <textarea
              id="favorite-place-note"
              autoFocus
              maxLength={240}
              value={draft.comment}
              onChange={(event) => setDraft({ ...draft, comment: event.target.value })}
              placeholder="A quiet courtyard, the best view, come back at sunset…"
              aria-label="Note about this saved place"
            />
            <div className="favorite-editor__meta"><span>{draft.comment.length}/240</span></div>
          </>
          )}
        </div>
        <div className="favorite-editor__actions">
          {mode === "edit" && existing && (
            <button className="favorite-editor__delete" type="button" onClick={() => onDelete(draft)}>Remove</button>
          )}
          {mode === "view" ? (
            <>
              <button className="favorite-editor__directions" type="button" onClick={() => onDirections(draft)}>
                <DirectionsIcon size={18} /> Get directions
              </button>
              <button className="favorite-editor__save" type="button" onClick={() => setMode("edit")}>Update note</button>
            </>
          ) : (
            <button
              className="favorite-editor__save"
              type="button"
              onClick={() => onSave(draft)}
              disabled={!draft.name.trim() || !draft.comment.trim()}
            >
              Save place
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
