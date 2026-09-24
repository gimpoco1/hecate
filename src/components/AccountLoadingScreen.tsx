import { useState } from "react";
import { HecateMark } from "./Icons";

export function AccountLoadingScreen({ visible }: { visible: boolean }) {
  const [artworkAvailable, setArtworkAvailable] = useState(true);

  return (
    <div
      className={`account-loading-screen${visible ? " account-loading-screen--visible" : ""}`}
      aria-hidden={!visible}
      role={visible ? "status" : undefined}
      aria-live={visible ? "polite" : undefined}
    >
      <div className="account-loading-screen__artwork" aria-hidden="true">
        {artworkAvailable ? (
          <svg
            className="account-loading-screen__engraving"
            viewBox="0 0 541 863"
            aria-hidden="true"
          >
            <clipPath id="hecate-artwork-crop">
              <rect x="3" y="0" width="535" height="863" />
            </clipPath>
            <filter
              id="hecate-paper-cutout"
              colorInterpolationFilters="sRGB"
              x="0"
              y="0"
              width="100%"
              height="100%"
            >
              <feColorMatrix
                type="matrix"
                values="
                  0 0 0 0 0.094
                  0 0 0 0 0.235
                  0 0 0 0 0.184
                  -0.2126 -0.7152 -0.0722 0 1
                "
              />
              <feComponentTransfer>
                <feFuncA type="linear" slope="2.4" intercept="-0.2" />
              </feComponentTransfer>
            </filter>
            <image
              href="/Hecate.webp"
              width="541"
              height="863"
              clipPath="url(#hecate-artwork-crop)"
              filter="url(#hecate-paper-cutout)"
              onError={() => setArtworkAvailable(false)}
            />
          </svg>
        ) : (
          <HecateMark size={74} />
        )}
      </div>
      <div className="account-loading-screen__copy">
        <span>Your map is returning</span>
        <strong>Gathering your discoveries.</strong>
        <p>Routes, cities, and milestones are finding their place.</p>
        <i aria-hidden="true" />
      </div>
    </div>
  );
}
