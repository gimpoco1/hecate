import { describe, expect, it } from "vitest";
import { parseAppleSignInCredential } from "./appleSignIn";

const credential = { identityToken: "header.payload.signature", nonce: "a".repeat(43) };

describe("native Apple sign-in response", () => {
  it("accepts credentials with the first-sign-in name or without a repeated name", () => {
    expect(parseAppleSignInCredential({ ...credential, fullName: "  Explorer  ", unrelated: true }))
      .toEqual({ ...credential, fullName: "Explorer" });
    expect(parseAppleSignInCredential(credential)).toEqual({ ...credential, fullName: null });
  });

  it("rejects missing credentials, malformed tokens, and invalid nonce responses", () => {
    for (const value of [null, {}, { ...credential, nonce: "short" }, { ...credential, identityToken: ".." },
      { ...credential, identityToken: "x".repeat(16385) }, { ...credential, fullName: 123 }]) {
      expect(() => parseAppleSignInCredential(value)).toThrow(TypeError);
    }
  });
});
