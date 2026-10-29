import { t } from "./i18n";
import type { LocalNotifications } from "@capacitor/local-notifications";

export const MORNING_INVITE_ACTION_TYPE_ID = "morning-invite-actions";
export const START_WALK_ACTION_ID = "start-walk";
export const JOURNEY_SPEED_STOP_ACTION_TYPE_ID = "journey-speed-stop-actions";
export const REPORT_JOURNEY_SPEED_STOP_ACTION_ID = "report-journey-speed-stop";

/** iOS replaces its categories, so always register the complete action set. */
export async function registerNotificationActions(
  client: Pick<typeof LocalNotifications, "registerActionTypes">,
): Promise<void> {
  await client.registerActionTypes({
    types: [
      {
        id: MORNING_INVITE_ACTION_TYPE_ID,
        actions: [{ id: START_WALK_ACTION_ID, title: t("Start walk"), foreground: true }],
      },
      {
        id: JOURNEY_SPEED_STOP_ACTION_TYPE_ID,
        actions: [{ id: REPORT_JOURNEY_SPEED_STOP_ACTION_ID, title: t("Report error"), foreground: true }],
      },
    ],
  });
}
