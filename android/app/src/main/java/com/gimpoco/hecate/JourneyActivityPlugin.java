package com.gimpoco.hecate;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONObject;

@CapacitorPlugin(name = "JourneyActivity")
public class JourneyActivityPlugin extends Plugin {
    private JourneyNotifications notifications;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final BroadcastReceiver appearanceReceiver = new BroadcastReceiver() {
        @Override public void onReceive(Context context, Intent intent) {
            if (notifications.active() == null || (!"system".equals(notifications.appearance()) && !"system".equals(notifications.languagePreference()))) return;
            JourneyNotifications.withService(context, service -> {
                JourneyState active = notifications.active();
                if (active != null && !service.updateJourneyNotification(active.walkId(), notifications.ongoing(active)))
                    throw new IllegalStateException("Could not refresh the active journey notification after a system appearance change.");
            }, error -> Log.e("HecateJourney", "Could not refresh journey appearance after a configuration change", error));
        }
    };
    private final BroadcastReceiver stoppedReceiver = new BroadcastReceiver() {
        @Override public void onReceive(Context context, Intent intent) {
            String walkId = intent.getStringExtra("walkId");
            if (walkId == null) throw new IllegalArgumentException("The native journey stop event is missing its journey ID.");
            JourneyState stopped = notifications.stopped(walkId);
            if (stopped != null) notifyListeners("stopRequested", JourneyNotifications.json(stopped), true);
        }
    };

    @Override public void load() {
        notifications = new JourneyNotifications(getContext());
        ContextCompat.registerReceiver(getContext(), stoppedReceiver, new IntentFilter(JourneyNotifications.STOPPED), ContextCompat.RECEIVER_NOT_EXPORTED);
        ContextCompat.registerReceiver(getContext(), appearanceReceiver, new IntentFilter(Intent.ACTION_CONFIGURATION_CHANGED), ContextCompat.RECEIVER_NOT_EXPORTED);
    }

    @Override protected void handleOnDestroy() {
        handler.removeCallbacksAndMessages(null);
        getContext().unregisterReceiver(stoppedReceiver);
        getContext().unregisterReceiver(appearanceReceiver);
    }

    private static String requiredString(PluginCall call, String name) {
        String value = call.getString(name);
        if (value == null || value.trim().isEmpty()) throw new IllegalArgumentException("Android journey action requires " + name + ".");
        return value;
    }

    private static double requiredNumber(PluginCall call, String name) {
        Double value = call.getDouble(name);
        if (value == null || !Double.isFinite(value)) throw new IllegalArgumentException("Android journey action requires a finite " + name + ".");
        return value;
    }

    private static JourneyState snapshot(PluginCall call, String ownerId, Long finishedAt) {
        return new JourneyState(requiredString(call, "walkId"), ownerId, (long) requiredNumber(call, "startedAt"),
            requiredNumber(call, "distanceKm"), call.getDouble("newGroundMeters"), finishedAt);
    }

    private static void reject(PluginCall call, RuntimeException error) {
        call.reject("Android journey action failed: " + error.getMessage(), error);
    }

    @PluginMethod public void start(PluginCall call) { getActivity().runOnUiThread(() -> startOnMain(call)); }
    @PluginMethod public void update(PluginCall call) { getActivity().runOnUiThread(() -> updateOnMain(call)); }
    @PluginMethod public void end(PluginCall call) { getActivity().runOnUiThread(() -> endOnMain(call)); }
    @PluginMethod public void clear(PluginCall call) { getActivity().runOnUiThread(() -> clearOnMain(call)); }
    @PluginMethod public void reconcile(PluginCall call) { getActivity().runOnUiThread(() -> reconcileOnMain(call)); }
    @PluginMethod public void getStopRequest(PluginCall call) { getActivity().runOnUiThread(() -> getStopRequestOnMain(call)); }
    @PluginMethod public void acknowledgeStop(PluginCall call) { getActivity().runOnUiThread(() -> acknowledgeStopOnMain(call)); }
    @PluginMethod public void setAppearance(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            try {
                String theme = requiredString(call, "theme");
                if (!"light".equals(theme) && !"dark".equals(theme)) throw new IllegalArgumentException("A resolved light or dark journey theme is required.");
                notifications.setAppearance(requiredString(call, "preference"));
                notifications.setLanguage(requiredString(call, "language"));
                JourneyState active = notifications.active();
                if (active == null) call.resolve();
                else publish(call, active, 0);
            } catch (IllegalArgumentException | IllegalStateException | SecurityException error) { reject(call, error); }
        });
    }

    private void startOnMain(PluginCall call) {
        try {
            JourneyState state = snapshot(call, requiredString(call, "ownerId"), null);
            if (notifications.stopped(state.walkId()) != null) { call.resolve(); return; }
            JourneyState previous = notifications.active();
            if (previous != null && !previous.walkId().equals(state.walkId()))
                throw new IllegalStateException("A different Android journey is still active. Stop it before starting another.");
            notifications.saveActive(state);
            publish(call, state, 0);
        } catch (IllegalArgumentException | IllegalStateException | SecurityException error) { reject(call, error); }
    }

    private void updateOnMain(PluginCall call) {
        try {
            JourneyState active = notifications.active();
            if (active == null || !active.walkId().equals(requiredString(call, "walkId"))) { call.resolve(); return; }
            JourneyState state = snapshot(call, active.ownerId(), null);
            notifications.saveActive(state);
            publish(call, state, 0);
        } catch (IllegalArgumentException | IllegalStateException | SecurityException error) { reject(call, error); }
    }

    private void publish(PluginCall call, JourneyState state, int attempt) {
        JourneyNotifications.withService(getContext(), service -> {
            JourneyState active = notifications.active();
            if (active == null || !active.walkId().equals(state.walkId()) || notifications.stopped(state.walkId()) != null) {
                call.resolve();
                return;
            }
            if (service.updateJourneyNotification(state.walkId(), notifications.ongoing(state))) { call.resolve(); return; }
            if (attempt >= 3) {
                call.reject("Android journey notification could not find its GPS watcher after four attempts. Journey ID: " + state.walkId());
                return;
            }
            Log.w("HecateJourney", "GPS watcher is not registered yet; retrying journey notification update");
            handler.postDelayed(() -> publish(call, state, attempt + 1), 250);
        }, error -> reject(call, error));
    }

    private void endOnMain(PluginCall call) {
        try {
            String walkId = requiredString(call, "walkId");
            JourneyState stopped = notifications.stopped(walkId);
            JourneyState active = notifications.active();
            JourneyState owner = stopped != null ? stopped : active;
            if (owner == null || !owner.walkId().equals(walkId)) { call.resolve(); return; }
            long finishedAt = stopped != null ? stopped.finishedAt() : (long) requiredNumber(call, "finishedAt");
            JourneyState state = snapshot(call, owner.ownerId(), finishedAt);
            if (active != null && active.walkId().equals(walkId)) notifications.clearActive();
            JourneyNotifications.withService(getContext(), service -> {
                service.stopJourney(walkId);
                notifications.showRecap(state);
                call.resolve();
            }, error -> reject(call, error));
        } catch (IllegalArgumentException | IllegalStateException | SecurityException error) { reject(call, error); }
    }

    private void clearOnMain(PluginCall call) {
        try {
            JourneyState active = notifications.active();
            notifications.clearActive();
            notifications.clearRecap();
            if (active == null) { call.resolve(); return; }
            JourneyNotifications.withService(getContext(), service -> {
                service.stopJourney(active.walkId());
                call.resolve();
            }, error -> reject(call, error));
        } catch (IllegalStateException | SecurityException error) { reject(call, error); }
    }

    private void reconcileOnMain(PluginCall call) {
        try {
            JourneyState active = notifications.active();
            if (active != null && (!active.ownerId().equals(requiredString(call, "ownerId")) ||
                !active.walkId().equals(call.getString("walkId")))) { clear(call); return; }
            call.resolve();
        } catch (IllegalArgumentException | IllegalStateException error) { reject(call, error); }
    }

    private void getStopRequestOnMain(PluginCall call) {
        try {
            JourneyState stopped = notifications.stopped(requiredString(call, "walkId"));
            String ownerId = requiredString(call, "ownerId");
            JSObject result = new JSObject();
            result.put("request", stopped != null && stopped.ownerId().equals(ownerId) ? JourneyNotifications.json(stopped) : JSONObject.NULL);
            call.resolve(result);
        } catch (IllegalArgumentException | IllegalStateException error) { reject(call, error); }
    }

    private void acknowledgeStopOnMain(PluginCall call) {
        try {
            String walkId = requiredString(call, "walkId");
            JourneyState stopped = notifications.stopped(walkId);
            String ownerId = requiredString(call, "ownerId");
            if (stopped != null && !stopped.ownerId().equals(ownerId))
                throw new IllegalArgumentException("The Android stop request belongs to a different account.");
            notifications.acknowledge(walkId);
            call.resolve();
        } catch (IllegalArgumentException | IllegalStateException error) { reject(call, error); }
    }
}
