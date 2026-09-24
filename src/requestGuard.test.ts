import { describe, expect, it } from "vitest";
import { createRequestGuard } from "./requestGuard";

describe("async request guard", () => {
  it("rejects a result after the owning panel closes", () => {
    const guard = createRequestGuard();
    const firstRequestIsCurrent = guard.begin();

    guard.invalidate();

    expect(firstRequestIsCurrent()).toBe(false);
  });

  it("only accepts the newest request", () => {
    const guard = createRequestGuard();
    const firstRequestIsCurrent = guard.begin();
    const secondRequestIsCurrent = guard.begin();

    expect(firstRequestIsCurrent()).toBe(false);
    expect(secondRequestIsCurrent()).toBe(true);
  });
});
