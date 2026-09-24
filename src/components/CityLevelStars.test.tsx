import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CityLevelStars } from "./CityLevelStars";

describe("CityLevelStars", () => {
  it("labels earned stars when used as standalone progress", () => {
    const markup = renderToStaticMarkup(<CityLevelStars level={2} />);
    expect(markup).toContain('aria-label="2 of 3 city stars earned"');
  });

  it("hides tier-preview stars from accessibility when the card supplies the label", () => {
    const markup = renderToStaticMarkup(
      <CityLevelStars level={3} decorative />,
    );
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).not.toContain("city stars earned");
  });
});
