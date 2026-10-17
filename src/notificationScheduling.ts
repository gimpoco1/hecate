import type { LocalNotificationSchema, LocalNotifications } from "@capacitor/local-notifications";

type NotificationScheduler = Pick<typeof LocalNotifications, "cancel" | "schedule">;

/** Replaces native schedules and rolls back an update invalidated during scheduling. */
export async function replaceNotificationSchedules(
  client: NotificationScheduler,
  ids: number[],
  notifications: LocalNotificationSchema[],
  isCurrent: () => boolean,
): Promise<void> {
  await client.cancel({ notifications: ids.map((id) => ({ id })) });
  if (!isCurrent() || notifications.length === 0) return;
  await client.schedule({ notifications });
  if (!isCurrent()) {
    await client.cancel({
      notifications: notifications.map(({ id }) => ({ id })),
    });
  }
}
