package com.equimaps.capacitor_background_geolocation;

import android.app.Notification;

/** Registers real GPS watchers through the package-scoped connector API for device integration checks. */
public final class JourneyWatcherFixture {
    public static void registerWalk(BackgroundGeolocationService.LocalBinder service, Notification notification, String walkId) {
        service.addWatcher("journey-integration-walk", notification, 8f, walkId, false);
    }

    public static void registerReminder(BackgroundGeolocationService.LocalBinder service, Notification notification) {
        service.addWatcher("journey-integration-reminder", notification, 30f, null, false);
    }

    public static void removeReminder(BackgroundGeolocationService.LocalBinder service) {
        service.removeWatcher("journey-integration-reminder");
    }
}
