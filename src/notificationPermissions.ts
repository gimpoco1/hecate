import { LocalNotifications } from "@capacitor/local-notifications";

type NotificationPermissionClient = Pick<
  typeof LocalNotifications,
  "checkPermissions" | "requestPermissions"
>;

export type NotificationSettingsPermissionState = {
  readonly notifications: boolean | null;
  readonly location: "pending" | "allowed" | "blocked";
  readonly motionError: string;
  readonly actionError: string;
};

/** Shows one actionable warning, resolving broader permission blockers first. */
export function notificationSettingsWarning(state: NotificationSettingsPermissionState): "error" | "notifications" | "location" | "motion" | null {
  if (state.actionError) return "error";
  if (state.notifications === false) return "notifications";
  if (state.notifications !== true) return null;
  if (state.location === "blocked") return "location";
  if (state.location !== "allowed") return null;
  return state.motionError ? "motion" : null;
}

/** Requests the one-time system prompt only while permission is undecided. */
export async function ensureNotificationPermission(
  client: NotificationPermissionClient = LocalNotifications,
) {
  let permission = await client.checkPermissions();
  if (
    permission.display === "prompt" ||
    permission.display === "prompt-with-rationale"
  ) {
    permission = await client.requestPermissions();
  }
  return permission.display === "granted";
}
