import { t } from "./i18n";
import { App as CapacitorApp } from "@capacitor/app";
import { Capacitor, type PluginListenerHandle } from "@capacitor/core";
import { Browser } from "@capacitor/browser";
import { AppleSignIn, parseAppleSignInCredential } from "./appleSignIn";
import { GoogleSignIn } from "./googleSignIn";
import { errorDiagnostic } from "./diagnostics";
import { supabase } from "./storage";

const NATIVE_AUTH_CALLBACK = "https://hecate-explore.vercel.app/auth/callback";
const IOS_GOOGLE_CALLBACK = "com.gimpoco.hecate.auth://callback";

export function authRedirectUrl(): string {
  return Capacitor.isNativePlatform()
    ? NATIVE_AUTH_CALLBACK
    : new URL("/auth/web-callback", window.location.origin).toString();
}

function trustedAuthCallback(url: string, webOrigin: string): URL | null {
  const callback = new URL(url);
  const nativeCallback = new URL(NATIVE_AUTH_CALLBACK);
  const isNativeCallback = callback.origin === nativeCallback.origin && callback.pathname === nativeCallback.pathname;
  const isWebCallback = callback.origin === webOrigin && callback.pathname === "/auth/web-callback";
  return isNativeCallback || isWebCallback ? callback : null;
}

function authorizationCode(callback: URL): string {
  if (callback.hash || callback.searchParams.has("access_token") || callback.searchParams.has("refresh_token")) {
    throw new Error(t("This sign-in link is no longer supported. Start sign-in again from Hecate."));
  }
  if (callback.searchParams.get("error") === "access_denied") {
    throw Object.assign(new Error(t("Sign-in cancelled.")), { code: "SIGN_IN_CANCELLED" });
  }
  if (callback.searchParams.has("error")) throw new Error(t("Sign-in could not be completed. Please try again from Hecate."));
  const code = callback.searchParams.get("code");
  if (!code || code.length > 2048) throw new Error(t("The sign-in link has no valid authorization code. Start sign-in again from Hecate."));
  return code;
}

/** Only a PKCE code can complete a sign-in initiated by this installation. */
export function authCallbackCode(url: string, webOrigin: string): string | null {
  const callback = trustedAuthCallback(url, webOrigin);
  return callback ? authorizationCode(callback) : null;
}

/** Only the result returned to this app's authentication session accepts the private iOS callback. */
export function googleSessionCallbackCode(url: string): string {
  const callback = new URL(url);
  if (callback.protocol !== "com.gimpoco.hecate.auth:" || callback.hostname !== "callback" || !["", "/"].includes(callback.pathname) ||
      callback.username || callback.password || callback.port) {
    throw new Error(t("Google returned an unexpected sign-in callback. Please start sign-in again."));
  }
  return authorizationCode(callback);
}

export function isSignInCancellation(error: unknown): boolean {
  return error !== null && typeof error === "object" && "code" in error && error.code === "SIGN_IN_CANCELLED";
}

/** Own the Android browser opened for authentication; email links do not close unrelated windows. */
function createGoogleAuthBrowser() {
  let active = false;
  let listener: PluginListenerHandle | null = null;
  const release = async (): Promise<void> => {
    active = false;
    const registered = listener;
    listener = null;
    if (registered) await registered.remove();
  };
  return {
    async open(url: string): Promise<void> {
      if (active) throw new Error(t("Google sign-in is already open. Finish or close it before trying again."));
      active = true;
      try {
        listener = await Browser.addListener("browserFinished", () => {
          void release().catch(error => console.error("Could not release the sign-in browser listener", errorDiagnostic(error)));
        });
        await Browser.open({ url, presentationStyle: "popover" });
      }
      catch (error) { await release(); throw error; }
    },
    async close(): Promise<void> {
      if (!active) return;
      try { await Browser.close(); }
      finally { await release(); }
    },
  };
}
const googleAuthBrowser = createGoogleAuthBrowser();

export async function signInWithGoogle(): Promise<void> {
  if (!supabase) throw new Error(t("Account sign-in is not configured in this build."));
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: Capacitor.getPlatform() === "ios" ? IOS_GOOGLE_CALLBACK : authRedirectUrl(), skipBrowserRedirect: true, scopes: "openid email profile", queryParams: { prompt: "select_account" } },
  });
  if (error) throw error;
  if (!data.url) throw new Error(t("Google sign-in did not return an authorization URL. Please try again."));
  if (Capacitor.getPlatform() === "ios") {
    const result = await GoogleSignIn.signIn({ url: data.url });
    await exchangeAuthCode(googleSessionCallbackCode(result.callbackURL));
  } else if (Capacitor.isNativePlatform()) await googleAuthBrowser.open(data.url);
  else window.location.assign(data.url);
}

export async function signInWithApple(): Promise<void> {
  if (Capacitor.getPlatform() !== "ios") throw new Error(t("Native Apple sign-in is available in the iOS app."));
  if (!supabase) throw new Error(t("Account sign-in is not configured in this build."));
  const credential = parseAppleSignInCredential(await AppleSignIn.signIn());
  const { data, error } = await supabase.auth.signInWithIdToken({ provider: "apple", token: credential.identityToken, nonce: credential.nonce });
  if (error) throw error;
  if (credential.fullName && !data.user.user_metadata.full_name) {
    const { error: nameError } = await supabase.auth.updateUser({ data: { full_name: credential.fullName } });
    if (nameError) throw new Error(t("You are signed in, but your Apple name could not be saved. You can still choose your public name when sharing."));
  }
}

export async function handleAuthCallback(url: string): Promise<boolean> {
  const callback = trustedAuthCallback(url, window.location.origin);
  if (!callback) return false;
  try {
    const code = authorizationCode(callback);
    await exchangeAuthCode(code);
    return true;
  } finally {
    if (Capacitor.getPlatform() === "android") await googleAuthBrowser.close();
  }
}

async function exchangeAuthCode(code: string): Promise<void> {
  if (!supabase) throw new Error(t("Account sign-in is not configured in this build."));
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) throw new Error(t("Sign-in expired or was opened outside the app or browser that started it. Please start sign-in again from Hecate."));
}

export async function initializeWebAuth(): Promise<void> {
  if (Capacitor.isNativePlatform()) return;
  if (!["/auth/callback", "/auth/web-callback"].includes(window.location.pathname)) return;
  const url = window.location.href;
  const nativeCallback = window.location.pathname === "/auth/callback";
  // Remove the one-time code even when exchange fails so it cannot linger in history.
  window.history.replaceState(null, "", "/leaderboard");
  if (nativeCallback) throw new Error(t("This sign-in link belongs to the Hecate app. Return to Hecate and start sign-in again."));
  await handleAuthCallback(url);
}

export async function initializeNativeAuthLinks() {
  if (!Capacitor.isNativePlatform() || !supabase) return;

  if (Capacitor.getPlatform() === "ios") await initializeAppleCredentialChecks();

  const handledUrls = new Set<string>();
  const openCallback = (url: string) => {
    if (handledUrls.has(url)) return;
    handledUrls.add(url);
    void handleAuthCallback(url).catch(error => {
      handledUrls.delete(url);
      if (isSignInCancellation(error)) return;
      console.error("Authentication callback failed", { errorType: error instanceof Error ? error.name : "InvalidCallback" });
      window.dispatchEvent(new CustomEvent("hecate:auth-error", { detail: error instanceof Error ? error.message : t("Sign-in failed. Please try again from Hecate.") }));
    });
  };
  // Subscribe before reading the launch URL so a callback arriving during app
  // startup cannot fall into the gap between those two operations.
  await CapacitorApp.addListener("appUrlOpen", event => openCallback(event.url));
  const launch = await CapacitorApp.getLaunchUrl();
  if (launch?.url) openCallback(launch.url);
}

/** Honor Apple consent revocation and account deletion, including changes made while Hecate was closed. */
async function initializeAppleCredentialChecks(): Promise<void> {
  const client = supabase;
  if (!client) throw new Error(t("Account sign-in is not configured in this build."));
  const check = async (): Promise<void> => {
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    const apple = data.session?.user.identities?.find(identity => identity.provider === "apple");
    if (!apple) return;
    const userID = apple.identity_data?.sub;
    if (typeof userID !== "string" || !userID) throw new Error(t("The Apple account has no valid identity. Please sign out and sign in again."));
    const result = await AppleSignIn.credentialState({ userID });
    if (result.state === "authorized") return;
    if (result.state !== "revoked") throw new Error(t("Apple returned an invalid account state. Please try again."));
    const { error: signOutError } = await client.auth.signOut({ scope: "local" });
    if (signOutError) throw signOutError;
    window.dispatchEvent(new CustomEvent("hecate:auth-error", { detail: t("Apple sign-in access was revoked. Please sign in again.") }));
  };
  const checkAfterChange = (): void => {
    void check().catch(error => {
      console.error("Apple account access check failed", errorDiagnostic(error));
      window.dispatchEvent(new CustomEvent("hecate:auth-error", { detail: error instanceof Error ? error.message : t("Apple account access could not be checked.") }));
    });
  };
  await AppleSignIn.addListener("credentialRevoked", checkAfterChange);
  await CapacitorApp.addListener("appStateChange", state => { if (state.isActive) checkAfterChange(); });
  checkAfterChange();
}
