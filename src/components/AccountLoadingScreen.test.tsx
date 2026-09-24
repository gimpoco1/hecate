import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AccountLoadingScreen } from "./AccountLoadingScreen";

describe("AccountLoadingScreen", () => {
  it("announces account hydration while visible", () => {
    const markup = renderToStaticMarkup(<AccountLoadingScreen visible />);

    expect(markup).toContain("account-loading-screen--visible");
    expect(markup).toContain('role="status"');
    expect(markup).toContain("Gathering your discoveries.");
    expect(markup).toContain('/Hecate.webp');
  });

  it("leaves the faded screen out of the accessibility tree", () => {
    const markup = renderToStaticMarkup(<AccountLoadingScreen visible={false} />);

    expect(markup).toContain('aria-hidden="true"');
    expect(markup).not.toContain('role="status"');
  });
});
