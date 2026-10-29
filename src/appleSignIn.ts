import { t } from "./i18n";
import { registerPlugin, type PluginListenerHandle } from "@capacitor/core";

export type AppleSignInCredential = { identityToken: string; nonce: string; fullName: string | null };
interface AppleSignInPlugin {
  signIn(): Promise<{ identityToken: string; nonce: string; fullName?: string }>
  credentialState(options: { userID: string }): Promise<{ state: "authorized" | "revoked" }>
  addListener(event: "credentialRevoked", listener: () => void): Promise<PluginListenerHandle>
}
export const AppleSignIn = registerPlugin<AppleSignInPlugin>("AppleSignIn");

/** Validate the native response before sending the identity token and raw nonce to Supabase. */
export function parseAppleSignInCredential(value: unknown): AppleSignInCredential {
  if (!value || typeof value !== "object" || !("identityToken" in value) || typeof value.identityToken !== "string" ||
      value.identityToken.length > 16384 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value.identityToken) ||
      !("nonce" in value) || typeof value.nonce !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(value.nonce) ||
      ("fullName" in value && typeof value.fullName !== "string")) {
    throw new TypeError(t("Apple returned an invalid sign-in response. Please try again."));
  }
  return { identityToken: value.identityToken, nonce: value.nonce,
    fullName: "fullName" in value ? (value.fullName as string).trim().slice(0, 300) || null : null };
}
