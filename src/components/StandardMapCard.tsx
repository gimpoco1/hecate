import { useAppearance } from "../appearance";
import { journeyHighlightColor, navigationRouteHalo } from "../mapRewardPalette";
import { t } from "../i18n";
import { MapPreviewIcon } from "./MapRewardCard";

type Props = {
  selected: boolean;
  expanded: boolean;
  onSelect: () => void;
  onPreview: () => void;
};

export function StandardMapCard({ selected, expanded, onSelect, onPreview }: Props) {
  return <div className="achievement-reward achievement-reward--standard" data-testid="reward-standard-card">
    <button type="button" className="achievement-reward__swatch" data-testid="preview-standard" aria-label={`${t("Preview reward")}: ${t("Standard map")}`} aria-expanded={expanded} aria-controls="reward-preview-standard" onClick={onPreview}>
      <StandardMapArtwork />
      <span className="achievement-reward__zoom" aria-hidden="true"><MapPreviewIcon /></span>
    </button>
    <div className="achievement-reward__details">
      <strong>{t("Standard map")}</strong>
      <button type="button" className="achievement-reward__select" data-testid="reward-standard" aria-pressed={selected} disabled={selected} onClick={onSelect}>
        <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
          {selected ? <path d="m4 10 4 4 8-8" /> : <path d="M4 10h12m-5-5 5 5-5 5" />}
        </svg>
        {t(selected ? "Selected" : "Select")}
      </button>
    </div>
  </div>;
}

function StandardMapArtwork() {
  const { theme } = useAppearance();
  const palette = theme === "dark" ? { water: "#090f1a", building: "#24364d", road: "#3d5069", park: "#12383c" } : { water: "#b5dbe8", building: "#e0ddd8", road: "#ffffff", park: "#dce8cb" };
  return <svg viewBox="0 0 640 200" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <path fill={palette.water} d="M0 0H128C110 30 180 50 153 88S113 142 176 200H0Z" />
    <path fill={palette.building} d="M235 15h60v35h-60zM325 15h60v35h-60zM415 15h60v35h-60zM505 15h60v35h-60zM595 15h45v35h-45zM235 80h60v30h-60zM325 80h60v30h-60zM415 80h60v30h-60zM505 80h60v30h-60zM595 80h45v30h-45zM235 140h60v30h-60zM325 140h60v30h-60zM415 140h60v30h-60zM505 140h60v30h-60zM595 140h45v30h-45z" />
    <path fill={palette.park} d="M170 18h35v35h-35zM505 140h60v30h-60z" />
    <path fill="none" stroke={palette.road} strokeWidth="3" d="M220 0V200M310 0V200M400 0V200M490 0V200M580 0V200M155 65H640M170 125H640M175 185H640M155 200 355 0" />
    <path fill="none" stroke={navigationRouteHalo("standard")} strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" d="M220 160V125H400V65H535" />
    <path fill="none" stroke={journeyHighlightColor("standard")} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" d="M220 160V125H400V65H535" />
    <circle cx="220" cy="160" r="6" fill="#27aee8" stroke="white" strokeWidth="2.5" />
  </svg>;
}
