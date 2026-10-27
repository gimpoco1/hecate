package com.gimpoco.hecate;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.ServiceConnection;
import android.content.SharedPreferences;
import android.content.res.Configuration;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.os.Build;
import android.os.IBinder;
import android.os.SystemClock;
import androidx.core.app.NotificationCompat;
import com.equimaps.capacitor_background_geolocation.BackgroundGeolocationService;
import com.getcapacitor.JSObject;
import org.json.JSONException;
import org.json.JSONObject;
import java.util.function.Consumer;

final class JourneyNotifications {
    static final String STOP = "com.gimpoco.hecate.STOP_JOURNEY";
    static final String EXPIRE = "com.gimpoco.hecate.EXPIRE_JOURNEY_RECAP";
    static final String STOPPED = "com.gimpoco.hecate.JOURNEY_STOPPED";
    static final String DEMOTE = "com.gimpoco.hecate.DEMOTE_JOURNEY";
    private static final String CHANNEL = "hecate.journeys";
    private static final int RECAP_ID = 28352;
    private final Context context;
    private final SharedPreferences preferences;
    private final NotificationManager manager;

    JourneyNotifications(Context context) {
        this.context = context.getApplicationContext();
        preferences = this.context.getSharedPreferences("hecate.journeys", Context.MODE_PRIVATE);
        manager = this.context.getSystemService(NotificationManager.class);
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel channel = new NotificationChannel(CHANNEL, "Walking journeys", NotificationManager.IMPORTANCE_LOW);
            channel.setDescription("Live walking distance, new area, elapsed time, and journey controls");
            channel.setSound(null, null);
            channel.enableVibration(false);
            manager.createNotificationChannel(channel);
        }
    }

    JourneyState active() { return read("active"); }
    JourneyState stopped(String walkId) { return read("stop." + walkId); }

    void setAppearance(String preference) {
        if (!"system".equals(preference) && !"light".equals(preference) && !"dark".equals(preference))
            throw new IllegalArgumentException("Journey appearance must be system, light, or dark.");
        commit(preferences.edit().putString("appearance", preference));
    }

    String appearance() { return preferences.getString("appearance", "system"); }

    boolean usesDarkAppearance() {
        String preference = appearance();
        if ("dark".equals(preference)) return true;
        if ("light".equals(preference)) return false;
        if (!"system".equals(preference)) throw new IllegalStateException("Saved Android journey appearance is invalid.");
        return (context.getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
    }

    private JourneyState read(String key) {
        String stored = preferences.getString(key, null);
        if (stored == null) return null;
        try {
            JSONObject json = new JSONObject(stored);
            return new JourneyState(json.getString("walkId"), json.getString("ownerId"), json.getLong("startedAt"),
                json.getDouble("distanceKm"), json.isNull("newGroundMeters") ? null : json.getDouble("newGroundMeters"),
                json.isNull("finishedAt") ? null : json.getLong("finishedAt"));
        } catch (JSONException error) {
            throw new IllegalStateException("Saved Android journey data is invalid: " + key, error);
        }
    }

    static JSObject json(JourneyState state) {
        JSObject json = new JSObject();
        json.put("walkId", state.walkId());
        json.put("ownerId", state.ownerId());
        json.put("startedAt", state.startedAt());
        json.put("distanceKm", state.distanceKm());
        json.put("newGroundMeters", state.newGroundMeters() == null ? JSONObject.NULL : state.newGroundMeters());
        json.put("finishedAt", state.finishedAt() == null ? JSONObject.NULL : state.finishedAt());
        return json;
    }

    void saveActive(JourneyState state) {
        clearRecap();
        commit(preferences.edit().putString("active", json(state).toString()));
    }

    void saveStop(JourneyState state) {
        commit(preferences.edit().putString("stop." + state.walkId(), json(state).toString()).remove("active"));
    }

    void clearActive() { commit(preferences.edit().remove("active")); }
    void acknowledge(String walkId) { commit(preferences.edit().remove("stop." + walkId)); }
    void demote(String walkId) { commit(preferences.edit().putString("demoted", walkId)); }

    private static void commit(SharedPreferences.Editor editor) {
        if (!editor.commit()) throw new IllegalStateException("Could not persist Android journey state on this device.");
    }

    Notification ongoing(JourneyState state) {
        PendingIntent stop = PendingIntent.getBroadcast(context, 0,
            new Intent(context, JourneyActionReceiver.class).setAction(STOP)
                .setData(android.net.Uri.parse("hecate://journey/stop/" + state.walkId()))
                .putExtra("walkId", state.walkId()), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        PendingIntent demote = PendingIntent.getBroadcast(context, 0,
            new Intent(context, JourneyActionReceiver.class).setAction(DEMOTE)
                .setData(android.net.Uri.parse("hecate://journey/demote/" + state.walkId())).putExtra("walkId", state.walkId()),
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        return builder().setContentTitle("Exploring…")
            .setContentText(state.metricsLabel()).setStyle(new NotificationCompat.BigTextStyle().bigText(state.metricsLabel()))
            .setWhen(state.startedAt()).setShowWhen(true).setUsesChronometer(true)
            .setOngoing(true).setRequestPromotedOngoing(!state.walkId().equals(preferences.getString("demoted", null)))
            .setShortCriticalText(state.distanceLabel()).setDeleteIntent(demote)
            .addAction(new NotificationCompat.Action(0, "Stop journey", stop)).build();
    }

    void showRecap(JourneyState state) {
        if (state.finishedAt() == null) throw new IllegalArgumentException("A completed journey is required to show its Android recap.");
        long remaining = state.finishedAt() + 5000 - System.currentTimeMillis();
        if (remaining <= 0 || !manager.areNotificationsEnabled()) return;
        String previous = preferences.getString("recap", null);
        if (previous != null && !previous.equals(state.walkId())) manager.cancel(previous, RECAP_ID);
        commit(preferences.edit().putString("recap", state.walkId()));
        Notification notification = builder().setContentTitle("Journey complete")
            .setContentText(state.metricsLabel() + " · " + state.elapsedLabel())
            .setStyle(new NotificationCompat.BigTextStyle().bigText(state.metricsLabel() + " · " + state.elapsedLabel()))
            .setShowWhen(false).setAutoCancel(true).setTimeoutAfter(remaining).build();
        manager.notify(state.walkId(), RECAP_ID, notification);
        if (Build.VERSION.SDK_INT < 26) {
            PendingIntent expire = PendingIntent.getBroadcast(context, 0,
                new Intent(context, JourneyActionReceiver.class).setAction(EXPIRE)
                    .setData(android.net.Uri.parse("hecate://journey/recap/" + state.walkId())).putExtra("walkId", state.walkId()),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            context.getSystemService(AlarmManager.class).setExact(AlarmManager.ELAPSED_REALTIME,
                SystemClock.elapsedRealtime() + remaining, expire);
        }
    }

    void expireRecap(String walkId) {
        manager.cancel(walkId, RECAP_ID);
        if (walkId.equals(preferences.getString("recap", null))) commit(preferences.edit().remove("recap"));
    }

    void clearRecap() {
        String previous = preferences.getString("recap", null);
        if (previous != null) manager.cancel(previous, RECAP_ID);
        commit(preferences.edit().remove("recap"));
    }

    private NotificationCompat.Builder builder() {
        Intent open = new Intent(context, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent content = PendingIntent.getActivity(context, 0, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Bitmap logo = Bitmap.createBitmap(96, 96, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(logo);
        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        boolean dark = usesDarkAppearance();
        paint.setColor(dark ? 0xff20292e : 0xfff7f4ed);
        canvas.drawCircle(48, 48, 48, paint);
        android.graphics.drawable.Drawable artwork = context.getDrawable(dark ? R.drawable.ic_launcher_dark_foreground : R.mipmap.ic_launcher_foreground);
        if (artwork == null) throw new IllegalStateException("Hecate's Android logo resource is missing.");
        android.graphics.Path clip = new android.graphics.Path();
        clip.addCircle(48, 48, 48, android.graphics.Path.Direction.CW);
        canvas.clipPath(clip);
        if (dark) artwork.setBounds(0, 0, 96, 96);
        else artwork.setBounds(8, 8, 88, 88);
        artwork.draw(canvas);
        return new NotificationCompat.Builder(context, CHANNEL)
            // A colorized background would make this ineligible for Android Live Updates.
            .setSmallIcon(R.drawable.ic_journey).setLargeIcon(logo).setColor(dark ? 0xffd9f26a : 0xff183c2f)
            .setContentIntent(content).setOnlyAlertOnce(true).setSilent(true)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE);
    }

    static void withService(Context context, Consumer<BackgroundGeolocationService.LocalBinder> operation,
                            Consumer<RuntimeException> failure) {
        Context application = context.getApplicationContext();
        ServiceConnection connection = new ServiceConnection() {
            @Override public void onServiceConnected(ComponentName name, IBinder binder) {
                try { operation.accept((BackgroundGeolocationService.LocalBinder) binder); }
                catch (RuntimeException error) { failure.accept(error); }
                finally { application.unbindService(this); }
            }
            @Override public void onServiceDisconnected(ComponentName name) {
                failure.accept(new IllegalStateException("Android GPS service disconnected during the journey action."));
            }
        };
        if (!application.bindService(new Intent(application, BackgroundGeolocationService.class), connection, Context.BIND_AUTO_CREATE))
            failure.accept(new IllegalStateException("Could not connect to Android's GPS tracking service."));
    }
}
