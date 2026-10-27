import { describe, expect, it } from "vitest";
import { parseAppearancePreference, resolveColorTheme } from "./appearance";

describe("appearance preferences", () => {
  it("follows the system only when selected, including a fresh installation", () => {
    expect(parseAppearancePreference(null)).toBe("system");
    expect(resolveColorTheme("system", true)).toBe("dark");
    expect(resolveColorTheme("system", false)).toBe("light");
    expect(resolveColorTheme("light", true)).toBe("light");
    expect(resolveColorTheme("dark", false)).toBe("dark");
    expect(parseAppearancePreference("dark")).toBe("dark");
    expect(() => parseAppearancePreference("invalid")).toThrow(TypeError);
  });
});
