import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { LANGUAGES, LANGUAGE_NAMES, currentLanguage, languagePreference, setLanguagePreference, t, useAppTranslation, type LanguagePreference } from "../i18n";
import { mdiTranslate } from "@mdi/js";
import { ArrowLeftIcon, ChevronIcon, XIcon } from "./Icons";

type Props = { onBack: () => void; onClose: () => void };

export function LanguageSettings({ onBack, onClose }: Props) {
  useAppTranslation();
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    const previousFocus = document.activeElement;
    const handleKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") { event.stopPropagation(); onBack(); }
      if (event.key !== "Tab") return;
      const elements = panel.current?.querySelectorAll<HTMLElement>("button, input:checked");
      if (!elements?.length) return;
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    panel.current?.querySelector<HTMLInputElement>("input:checked")?.focus();
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("keydown", handleKey);
      if (previousFocus instanceof HTMLElement) previousFocus.focus();
    };
  }, []);
  const [error, setError] = useState("");
  const preference = languagePreference();
  async function chooseLanguage(value: LanguagePreference): Promise<void> {
    try {
      await setLanguagePreference(value);
      setError("");
    } catch (error) {
      console.error("Could not save language", { preference: value, error });
      setError(t("Could not save your language. Check that device storage is available and try again."));
    }
  }
  return createPortal(<div className="sheet-backdrop gpx-import-backdrop" onClick={event => { event.stopPropagation(); onBack(); }}>
    <section ref={panel} className="sheet profile-collection-sheet appearance-settings-sheet" data-testid="language-panel"
      onClick={event => event.stopPropagation()} aria-modal="true" role="dialog" aria-labelledby="language-settings-title">
      <button type="button" className="icon-button walking-stats-back" data-testid="language-back" aria-label={t("Back")} onClick={onBack}><ArrowLeftIcon /></button>
      <button type="button" className="icon-button sheet__close" data-testid="language-close" aria-label={t("Close")} onClick={onClose}><XIcon /></button>
      <div className="eyebrow">{t("Make it yours")}</div>
      <h2 id="language-settings-title">{t("Language")}</h2>
      <p>{t("Choose your language, or follow your device settings.")}</p>
      <fieldset className="language-options" aria-label={t("App language")}>
        {(["system", ...LANGUAGES] as const).map(value => <label key={value}>
          <input type="radio" name="language" value={value} checked={preference === value} data-testid={`language-${value}`}
            onChange={() => void chooseLanguage(value)} />
          <span lang={value === "system" ? undefined : value}>{value === "system" ? t("System · follows your device") : LANGUAGE_NAMES[value]}</span>
        </label>)}
      </fieldset>
      {error && <p role="alert">{error}</p>}
    </section>
  </div>, document.body);
}

export function LanguageButton({ onClick }: { onClick: () => void }) {
  useAppTranslation();
  const preference = languagePreference();
  return <button type="button" className="account-settings-link" data-testid="language-open" aria-label={t("Open language settings")} aria-haspopup="dialog" onClick={onClick}>
    <span className="account-settings-link__mark" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d={mdiTranslate} /></svg></span><span><strong>{t("Language")}</strong><small>{preference === "system" ? t("System · follows your device") : LANGUAGE_NAMES[preference]}</small></span><ChevronIcon size={16} strokeWidth={2.3} />
  </button>;
}

export function LeaderboardLanguageButton({ onClick }: { onClick: () => void }) {
  useAppTranslation();
  const language = currentLanguage();
  const name = LANGUAGE_NAMES[language];
  return <button type="button" className="leaderboard-language-button" data-testid="language-open"
    aria-label={`${t("Open language settings")}: ${name}`} aria-haspopup="dialog" onClick={onClick}>
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d={mdiTranslate} /></svg>
    <span className="leaderboard-language-button__name" lang={language}>{name}</span>
    <span className="leaderboard-language-button__code" aria-hidden="true">{language.toUpperCase()}</span>
    <ChevronIcon size={13} />
  </button>;
}
