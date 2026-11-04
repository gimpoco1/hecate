import { describe, expect, it } from "vitest";
import { contextualGuideDismissed } from "./contextualGuides";

describe("contextual guide acknowledgement", () => {
  it("shows unacknowledged guides and restores an explicit dismissal", () => {
    expect(contextualGuideDismissed(null)).toBe(false);
    expect(contextualGuideDismissed("dismissed")).toBe(true);
    expect(() => contextualGuideDismissed("false")).toThrow(TypeError);
  });
});
