package com.gimpoco.hecate;

import static org.junit.Assert.*;
import android.app.Notification;
import android.app.NotificationManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.ServiceConnection;
import android.os.IBinder;
import android.os.SystemClock;
import android.service.notification.StatusBarNotification;
import androidx.core.app.NotificationCompat;
import androidx.lifecycle.Lifecycle;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import com.equimaps.capacitor_background_geolocation.BackgroundGeolocationService;
import com.equimaps.capacitor_background_geolocation.JourneyWatcherFixture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.BooleanSupplier;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class JourneyNotificationDeviceTest {
    private static Context testContext() {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        if (!context.getPackageName().equals("com.gimpoco.hecate.journeytest"))
            throw new IllegalStateException("Use ./gradlew -I journey-test.init.gradle :app:connectedDebugAndroidTest to isolate notification test data.");
        return context;
    }

    private static void await(BooleanSupplier condition, long timeoutMs) {
        long deadline = SystemClock.elapsedRealtime() + timeoutMs;
        while (!condition.getAsBoolean() && SystemClock.elapsedRealtime() < deadline) SystemClock.sleep(50);
        assertTrue("Android journey condition did not become true before its deadline", condition.getAsBoolean());
    }

    private static StatusBarNotification notification(Context context, int id) {
        for (StatusBarNotification notification : context.getSystemService(NotificationManager.class).getActiveNotifications())
            if (notification.getId() == id) return notification;
        return null;
    }

    @Test public void stopFromNotificationWhileBackgroundedThenDismissRecap() throws Exception {
        Context context = testContext();
        JourneyNotifications notifications = new JourneyNotifications(context);
        AtomicReference<BackgroundGeolocationService.LocalBinder> service = new AtomicReference<>();
        CountDownLatch connected = new CountDownLatch(1);
        ServiceConnection connection = new ServiceConnection() {
            @Override public void onServiceConnected(ComponentName name, IBinder binder) {
                service.set((BackgroundGeolocationService.LocalBinder) binder);
                connected.countDown();
            }
            @Override public void onServiceDisconnected(ComponentName name) { service.set(null); }
        };
        String walkId = "native-notification-integration-" + System.currentTimeMillis();
        try (ActivityScenario<MainActivity> activity = ActivityScenario.launch(MainActivity.class)) {
            assertTrue(context.bindService(new Intent(context, BackgroundGeolocationService.class), connection, Context.BIND_AUTO_CREATE));
            assertTrue(connected.await(10, TimeUnit.SECONDS));
            JourneyState state = new JourneyState(walkId, "device-test", System.currentTimeMillis() - 61_000, 0.12, 0.08, null);
            Notification ongoing = notifications.ongoing(state);
            assertTrue(ongoing.extras.getBoolean(Notification.EXTRA_SHOW_CHRONOMETER));
            assertEquals("120 m", state.distanceLabel());
            InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> {
                notifications.saveActive(state);
                JourneyWatcherFixture.registerWalk(service.get(), ongoing, walkId);
                assertTrue(service.get().updateJourneyNotification(walkId, ongoing));
            });
            await(() -> notification(context, 28351) != null, 5000);
            InstrumentationRegistry.getInstrumentation().getUiAutomation().executeShellCommand("input keyevent KEYCODE_HOME").close();
            await(() -> activity.getState() != Lifecycle.State.RESUMED, 5000);
            ongoing.actions[0].actionIntent.send();
            await(() -> notifications.stopped(walkId) != null && notification(context, 28352) != null, 5000);
            assertNull(notifications.active());
            assertNull(notification(context, 28351));
            assertNotEquals(Lifecycle.State.RESUMED, activity.getState());
            AtomicReference<Boolean> stillTracking = new AtomicReference<>();
            InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> {
                JourneyWatcherFixture.registerWalk(service.get(), ongoing, walkId);
                stillTracking.set(service.get().updateJourneyNotification(walkId, ongoing));
            });
            assertFalse(stillTracking.get());
            await(() -> notification(context, 28352) == null, 7000);
            // A stale Stop token must not stop or overwrite the next walk.
            JourneyState next = new JourneyState(walkId + "-next", "device-test", System.currentTimeMillis(), 0, null, null);
            notifications.saveActive(next);
            ongoing.actions[0].actionIntent.send();
            SystemClock.sleep(250);
            assertEquals(next.walkId(), notifications.active().walkId());
            notifications.clearActive();
        } finally {
            notifications.acknowledge(walkId);
            notifications.clearRecap();
            context.unbindService(connection);
        }
    }

    @Test public void stoppingWalkPreservesPassiveReminderWatcher() throws Exception {
        Context context = testContext();
        JourneyNotifications notifications = new JourneyNotifications(context);
        CountDownLatch complete = new CountDownLatch(1);
        AtomicReference<Throwable> failure = new AtomicReference<>();
        AtomicReference<BackgroundGeolocationService.LocalBinder> bound = new AtomicReference<>();
        String walkId = "native-passive-integration-" + System.currentTimeMillis();
        try (ActivityScenario<MainActivity> activity = ActivityScenario.launch(MainActivity.class)) {
            JourneyState state = new JourneyState(walkId, "device-test", System.currentTimeMillis(), 0, null, null);
            Notification walk = notifications.ongoing(state);
            Notification reminder = new NotificationCompat.Builder(context, "hecate.journeys")
                .setSmallIcon(R.drawable.ic_journey).setContentTitle("Discovery reminders").setOngoing(true)
                .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE).build();
            JourneyNotifications.withService(context, service -> {
                try {
                    JourneyWatcherFixture.registerReminder(service, reminder);
                    JourneyWatcherFixture.registerWalk(service, walk, walkId);
                    service.stopJourney(walkId);
                    assertFalse(service.updateJourneyNotification(walkId, walk));
                    bound.set(service);
                } catch (AssertionError error) { failure.set(error); }
                finally { complete.countDown(); }
            }, error -> { failure.set(error); complete.countDown(); });
            assertTrue(complete.await(10, TimeUnit.SECONDS));
            if (failure.get() != null) throw new AssertionError("Passive reminder integration failed", failure.get());
            await(() -> {
                StatusBarNotification remaining = notification(context, 28351);
                return remaining != null && "Discovery reminders".equals(remaining.getNotification().extras.getString(Notification.EXTRA_TITLE));
            }, 5000);
            InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> JourneyWatcherFixture.removeReminder(bound.get()));
        }
    }
}
