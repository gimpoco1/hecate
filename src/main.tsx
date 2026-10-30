import i18n from "i18next";
import { t } from "./i18n";
import { errorDiagnostic } from "./diagnostics";
import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { Capacitor } from "@capacitor/core";
import { initializeNativeAuthLinks, initializeWebAuth, isSignInCancellation } from "./auth";
import { isLeaderboardPath, shouldRedirectBrowserToLeaderboard } from "./routes";
import "./styles.css";
import { initializeAppearance } from "./appearance";

initializeAppearance();

const nativePlatform = Capacitor.isNativePlatform();
const redirectingBrowser = shouldRedirectBrowserToLeaderboard(
  window.location.pathname,
  nativePlatform,
  import.meta.env.DEV,
);
if (redirectingBrowser) {
  window.location.replace(`/leaderboard${window.location.search}${window.location.hash}`);
}

const leaderboardRoute = !nativePlatform && (
  redirectingBrowser || isLeaderboardPath(window.location.pathname) ||
  window.location.pathname === "/auth/callback" || window.location.pathname === "/auth/web-callback"
);
const RootExperience = leaderboardRoute
  ? lazy(() => import("./components/WebLeaderboard").then(module => ({ default: module.WebLeaderboard })))
  : lazy(() => import("./App"));

function translateDocument(): void {
  document.title = leaderboardRoute ? t("Hecate — Discovery leaderboard") : t("Hecate — Discover your world");
  document.querySelector('meta[name="description"]')?.setAttribute("content", leaderboardRoute
    ? t("See which Hecate explorers have uncovered the most new ground, overall and city by city.")
    : t("Track your walks, reveal new ground, and discover your world with Hecate."));
}
translateDocument();
i18n.on("languageChanged", translateDocument);

function renderExperience(): void {
  createRoot(document.getElementById("root")!).render(<StrictMode><Suspense fallback={null}><RootExperience /></Suspense></StrictMode>);
}

void initializeWebAuth().then(renderExperience).catch((error: Error) => {
  if (isSignInCancellation(error)) {
    renderExperience();
    return;
  }
  const message = document.createElement("p");
  message.setAttribute("role", "alert");
  message.textContent = error.message;
  const retry = document.createElement("a");
  retry.href = "/leaderboard";
  retry.dataset.testid = "auth-retry";
  retry.textContent = t("Return to Hecate and try again");
  document.getElementById("root")!.replaceChildren(message, retry);
});
void initializeNativeAuthLinks();

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", async () => {
    const hadController = Boolean(navigator.serviceWorker.controller);
    let refreshing = false;

    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (hadController && !refreshing) {
        refreshing = true;
        window.location.reload();
      }
    });

    try {
      const registration = await navigator.serviceWorker.register("/sw.js");
      await registration.update();
    } catch (error) {
      console.error("Service worker registration failed", errorDiagnostic(error));
    }
  });
}
