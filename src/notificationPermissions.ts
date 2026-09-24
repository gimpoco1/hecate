import { LocalNotifications } from "@capacitor/local-notifications";

type NotificationPermissionClient = Pick<
  typeof LocalNotifications,
  "checkPermissions" | "requestPermissions"
>;

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
