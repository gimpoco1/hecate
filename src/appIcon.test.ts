import { expect, it } from "vitest";
import { parseAppIconState } from "./appIcon";

it("validates the icon and platform support returned by iOS before displaying a selection", () => {
  expect(parseAppIconState({ supported: true, icon: "dark" })).toEqual({ supported: true, icon: "dark" });
  expect(parseAppIconState({ supported: false, icon: "original" })).toEqual({ supported: false, icon: "original" });
  expect(() => parseAppIconState({ supported: true, icon: "missing" })).toThrow(TypeError);
  expect(() => parseAppIconState({ supported: "true", icon: "original" })).toThrow(TypeError);
  expect(() => parseAppIconState(null)).toThrow(TypeError);
});
