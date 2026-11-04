import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { t } from "./i18n";

export function canRequestOnboardingNotifications(): boolean {
  return Capacitor.isNativePlatform() || typeof Notification !== "undefined";
}

/** Called only by the intro's Enable notifications button. */
export async function requestOnboardingNotifications(): Promise<boolean> {
  if (Capacitor.isNativePlatform()) return (await LocalNotifications.requestPermissions()).display === "granted";
  if (typeof Notification === "undefined") throw new Error(t("Notifications are available in the mobile app."));
  return await Notification.requestPermission() === "granted";
}

/** Restores the actual OS decision when a permission step is opened or replayed. */
export async function readOnboardingNotificationPermission(): Promise<boolean | null> {
  if (!Capacitor.isNativePlatform()) {
    if (typeof Notification === "undefined") return null;
    return Notification.permission === "default" ? null : Notification.permission === "granted";
  }
  const { display } = await LocalNotifications.checkPermissions();
  if (display === "granted") return true;
  if (display === "denied") return false;
  if (display === "prompt" || display === "prompt-with-rationale") return null;
  throw new TypeError(t("Unrecognized notification permission status: {{status}}", { status: display }));
}
