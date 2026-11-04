import { useGuideMotion } from "../guideMotion";
import { BellIcon, CompassIcon, LocateIcon, RouteIcon, SaveIcon } from "./Icons";

export type IntroArtworkKind = "discover" | "journey" | "features" | "location" | "notifications" | "motion";

export function IntroArtwork({ kind }: { kind: IntroArtworkKind }) {
  const { enabled } = useGuideMotion();
  return <div className={`onboarding-art onboarding-art--${kind}`} data-animated={enabled} aria-hidden="true">
    {kind === "discover" && <svg viewBox="0 0 400 300" fill="none">
      <defs>
        <pattern id="intro-city-blocks" width="64" height="58" patternTransform="rotate(-18)" patternUnits="userSpaceOnUse">
          <rect x="7" y="7" width="50" height="44" rx="10" fill="currentColor" opacity=".08" />
        </pattern>
        <clipPath id="intro-map-edge"><rect x="30" y="26" width="340" height="248" rx="60" /></clipPath>
        <radialGradient id="intro-discovery-glow"><stop stopColor="var(--lime)" stopOpacity=".35" /><stop offset="1" stopColor="var(--lime)" stopOpacity="0" /></radialGradient>
      </defs>
      <g clipPath="url(#intro-map-edge)">
        <rect x="30" y="26" width="340" height="248" fill="currentColor" opacity=".035" />
        <rect x="30" y="26" width="340" height="248" fill="url(#intro-city-blocks)" />
        <path d="M290 12c-65 64 85 105 27 169s-19 90 20 114" stroke="#79b9c2" strokeWidth="36" opacity=".3" />
        <path d="m12 227 85-35 33-77 118-37 139 39M78 10l36 79 81 87 42 114" stroke="var(--paper)" strokeWidth="13" strokeLinejoin="round" />
        <circle className="intro-discovery-glow" cx="205" cy="145" r="120" fill="url(#intro-discovery-glow)" />
        <path d="M72 225l53-31c17-10 13-46 33-57l69-24c26-10 22-40 47-49l25-8" stroke="var(--lime)" strokeWidth="23" strokeLinecap="round" opacity=".15" />
        <path className="intro-discovery-route" pathLength="1" d="M72 225l53-31c17-10 13-46 33-57l69-24c26-10 22-40 47-49l25-8" stroke="var(--lime)" strokeWidth="10" strokeLinecap="round" />
        <g fill="var(--forest)" opacity=".6"><circle cx="63" cy="91" r="11" /><circle cx="78" cy="79" r="14" /><circle cx="89" cy="94" r="10" /><circle cx="249" cy="222" r="13" /><circle cx="267" cy="213" r="16" /></g>
      </g>
      <circle cx="72" cy="225" r="12" fill="var(--paper)" stroke="currentColor" strokeWidth="3" /><circle cx="72" cy="225" r="4" fill="currentColor" />
      <g className="intro-destination">
        <circle cx="299" cy="56" r="33" fill="var(--lime)" opacity=".15" />
        <path d="M299 83s21-19 21-34a21 21 0 0 0-42 0c0 15 21 34 21 34Z" fill="var(--lime)" stroke="#183c2f" strokeWidth="2" />
        <path d="m299 37 3.5 7 7.5 1-5.5 5.5 1.5 7.5-7-3.5-7 3.5 1.5-7.5L288 45l7.5-1Z" fill="#183c2f" />
      </g>
      <g className="intro-map-compass" transform="translate(335 225) rotate(12)">
        <rect x="-29" y="-29" width="58" height="58" rx="20" fill="var(--paper)" stroke="currentColor" strokeOpacity=".12" />
        <circle r="17" stroke="currentColor" strokeWidth="2" /><path d="m8-8-5 11-11 5 5-11Z" fill="currentColor" />
      </g>
    </svg>}
    {kind === "journey" && <svg viewBox="0 0 400 300" fill="none">
      <rect x="111" y="12" width="178" height="276" rx="30" fill="var(--paper)" stroke="currentColor" strokeWidth="3" />
      <rect x="129" y="52" width="142" height="150" rx="12" fill="currentColor" opacity=".06" />
      <path d="M145 178h36v-45h36V83h37" stroke="var(--lime)" strokeWidth="17" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="217" cy="133" r="9" fill="currentColor" stroke="var(--paper)" strokeWidth="3" />
      <path d="M173 30h54M140 223h37m10 0h30m10 0h30" stroke="currentColor" strokeWidth="4" strokeLinecap="round" opacity=".35" />
      <circle cx="200" cy="255" r="20" fill="var(--lime)" /><path d="m195 246 14 9-14 9Z" fill="#183c2f" />
      <path d="M68 157c-31-35-25-87 7-116m250 113c31 35 25 87-7 116" stroke="currentColor" strokeWidth="2" strokeDasharray="4 8" opacity=".25" />
    </svg>}
    {kind === "features" && <div className="onboarding-feature-art">
      <span className="onboarding-feature-route"><RouteIcon size={56} /></span>
      <span className="onboarding-feature-save"><SaveIcon size={46} /></span>
      <span className="onboarding-feature-stars"><svg viewBox="0 0 100 65" width="100" height="65" fill="currentColor"><path d="m50 8 6 16 17 1-13 11 4 17-14-9-14 9 4-17-13-11 17-1Z" /><circle cx="15" cy="48" r="5" opacity=".25" /><circle cx="85" cy="48" r="5" opacity=".25" /></svg></span>
      <span className="onboarding-feature-compass"><CompassIcon size={48} /></span>
    </div>}
    {kind === "location" && <><svg viewBox="0 0 400 300" fill="none">
      <circle cx="200" cy="150" r="120" stroke="currentColor" opacity=".08" strokeWidth="2" />
      <circle cx="200" cy="150" r="83" stroke="currentColor" opacity=".12" strokeWidth="2" />
      <path d="M40 150h320M200 15v270" stroke="currentColor" opacity=".1" strokeWidth="2" strokeDasharray="5 9" />
      <circle cx="200" cy="150" r="48" fill="var(--lime)" /><circle cx="200" cy="150" r="13" fill="#183c2f" />
      <path d="M112 248h49m78-196h49" stroke="currentColor" strokeWidth="10" strokeLinecap="round" opacity=".15" />
      <g transform="translate(300 60) rotate(8)"><rect x="-30" y="-30" width="60" height="60" rx="20" fill="var(--paper)" /><svg x="-18" y="-18" width="36" height="36"><LocateIcon size={36} /></svg></g>
    </svg></>}
    {kind === "motion" && <svg viewBox="0 0 400 300" fill="none">
      <circle cx="200" cy="150" r="115" fill="currentColor" opacity=".05" />
      <path d="M92 228c70 0 30-150 100-150s30 150 100 150" stroke="currentColor" strokeWidth="3" strokeDasharray="5 9" opacity=".2" />
      <g transform="rotate(-20 160 135)"><ellipse cx="160" cy="139" rx="20" ry="40" fill="var(--lime)" /><circle cx="160" cy="194" r="15" fill="var(--lime)" /></g>
      <g transform="rotate(20 240 105)"><ellipse cx="240" cy="109" rx="20" ry="40" fill="currentColor" /><circle cx="240" cy="164" r="15" fill="currentColor" /></g>
    </svg>}
    {kind === "notifications" && <><svg viewBox="0 0 400 300" fill="none">
      <rect x="75" y="90" width="250" height="150" rx="24" fill="currentColor" opacity=".06" transform="rotate(-9 200 165)" />
      <rect x="63" y="104" width="274" height="140" rx="24" fill="var(--paper)" stroke="currentColor" strokeWidth="2" />
      <circle cx="104" cy="150" r="20" fill="var(--lime)" /><path d="M143 141h134m-134 19h97M87 198h216m-216 17h165" stroke="currentColor" strokeLinecap="round" strokeWidth="7" opacity=".2" />
      <circle cx="291" cy="71" r="37" fill="var(--lime)" />
      <svg x="273" y="53" width="36" height="36" color="#183c2f"><BellIcon size={36} /></svg>
    </svg></>}
  </div>;
}
