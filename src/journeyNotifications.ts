import type { LocalNotifications } from "@capacitor/local-notifications";
import type { AppLauncher } from "@capacitor/app-launcher";
import { JOURNEY_SPEED_STOP_ACTION_TYPE_ID, registerNotificationActions } from "./notificationActions";

export const JOURNEY_SPEED_STOP_NOTIFICATION_ID = 1046;
export const JOURNEY_SPEED_STOP_MESSAGE =
  "Your journey was stopped because your speed was too high for walking. Your progress up to that point has been saved.";

type JourneyNotificationClient = Pick<
  typeof LocalNotifications,
  "checkPermissions" | "schedule" | "registerActionTypes"
>;

export type JourneySpeedStopReport = {
  userId: string;
  walkId: string;
};

/** Open a support draft for the user to review and send, without route coordinates. */
export async function openJourneySpeedStopReport(
  client: Pick<typeof AppLauncher, "openUrl">,
  report: JourneySpeedStopReport,
): Promise<void> {
  const subject = "Incorrect journey speed stop";
  const body = [
    "My journey was stopped for moving too fast, but I believe that was an error.",
    "",
    "What happened:",
    "",
    "",
    `Account ID: ${report.userId}`,
    `Journey ID: ${report.walkId}`,
  ].join("\n");
  const url = `mailto:supporthecate@gmail.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  const { completed } = await client.openUrl({ url });
  if (!completed) {
    throw new Error(`No email app accepted the speed-stop report for journey ${report.walkId}. Contact supporthecate@gmail.com and include this journey ID.`);
  }
}

/** Explain an automatic stop without opening a permission prompt in the background. */
export async function sendJourneySpeedStopNotification(
  client: JourneyNotificationClient,
  userId: string,
  walkId: string,
  isCurrent: () => boolean,
): Promise<void> {
  const permission = await client.checkPermissions();
  if (permission.display !== "granted" || !isCurrent()) return;
  for (let attempt = 1; ; attempt += 1) {
    if (!isCurrent()) return;
    try {
      await registerNotificationActions(client);
      if (!isCurrent()) return;
      await client.schedule({
        notifications: [{
          id: JOURNEY_SPEED_STOP_NOTIFICATION_ID,
          title: "Journey stopped — speed too high",
          body: JOURNEY_SPEED_STOP_MESSAGE,
          isExactNotification: false,
          sound: "default",
          threadIdentifier: "hecate-journeys",
          actionTypeId: JOURNEY_SPEED_STOP_ACTION_TYPE_ID,
          extra: { kind: "journey-speed-stop", userId, walkId },
        }],
      });
      return;
    } catch (error) {
      if (attempt === 3) throw error;
      console.warn("Could not send journey speed-stop notification; retrying", {
        userId, walkId, attempt, error,
      });
    }
  }
}
