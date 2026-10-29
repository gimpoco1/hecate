import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { CityBoundary } from "../city";
import { CitiesSheet } from "./ProfileCollections";

const city: CityBoundary = {
  id: "city:test",
  name: "Test City",
  geometry: {
    type: "Polygon",
    coordinates: [
      [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
        [0, 0],
      ],
    ],
  },
  fetchedAt: 1,
};

describe("CitiesSheet", () => {
  it("shows available cities while a background refresh is still loading", () => {
    const markup = renderToStaticMarkup(
      <CitiesSheet
        open
        loading
        cityProgresses={[{ city, percentage: 12.5, distance: 3 }]}
        onCitySelect={() => undefined}
        onKeepsake={() => undefined}
        onBack={() => undefined}
        onClose={() => undefined}
      />,
    );

    expect(markup).toContain("Test City");
    expect(markup).not.toContain("Finding past cities");
  });
});
