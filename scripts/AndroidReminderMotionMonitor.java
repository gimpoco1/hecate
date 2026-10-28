package com.equimaps.capacitor_background_geolocation;

import android.app.PendingIntent;
import android.content.Context;
import android.content.BroadcastReceiver;
import android.content.IntentFilter;
import androidx.localbroadcastmanager.content.LocalBroadcastManager;
import android.content.Intent;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import com.getcapacitor.Logger;
import com.google.android.gms.location.ActivityRecognition;
import com.google.android.gms.location.ActivityRecognitionClient;
import com.google.android.gms.location.ActivityRecognitionResult;
import com.google.android.gms.location.ActivityTransition;
import com.google.android.gms.location.ActivityTransitionRequest;
import com.google.android.gms.location.ActivityTransitionResult;
import com.google.android.gms.location.DetectedActivity;
import com.google.android.gms.tasks.Task;
import com.google.android.gms.tasks.Tasks;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.function.Supplier;

/** Low-power activity transitions gate reminder GPS; a bounded initial sample handles an existing walk. */
final class AndroidReminderMotionMonitor {
    static final String ACTION_PREFIX = "hecate.reminder.motion.";
    interface Listener {
        void onMovementChanged(boolean moving);
        void onFailure(Exception error);
    }

    private final ActivityRecognitionClient client;
    private final Listener listener;
    private final LocalBroadcastManager broadcasts;
    private final BroadcastReceiver delivery = new BroadcastReceiver() {
        @Override public void onReceive(Context context, Intent intent) { onIntent(intent); }
    };
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final String session = ACTION_PREFIX + UUID.randomUUID();
    private final String transitionAction = session + ".transitions";
    private final String sampleAction = session + ".sample";
    private final PendingIntent transitions;
    private final PendingIntent initialSample;
    private final Runnable sampleTimeout = this::stopInitialSample;
    private Task<Void> registration = Tasks.forResult(null);
    private Set<AndroidReminderMotionState.Activity> activities = Collections.emptySet();
    private long lastEventNanos = 0;
    private boolean active = false;
    private boolean sampling = false;

    AndroidReminderMotionMonitor(Context context, Listener listener) {
        this.client = ActivityRecognition.getClient(context);
        this.listener = listener;
        broadcasts = LocalBroadcastManager.getInstance(context);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 31 ? PendingIntent.FLAG_MUTABLE : 0);
        transitions = PendingIntent.getBroadcast(context, 0,
            new Intent(context, AndroidReminderMotionReceiver.class).setAction(transitionAction), flags);
        initialSample = PendingIntent.getBroadcast(context, 0,
            new Intent(context, AndroidReminderMotionReceiver.class).setAction(sampleAction), flags);
    }

    Task<Void> start() {
        active = true;
        IntentFilter filter = new IntentFilter(transitionAction);
        filter.addAction(sampleAction);
        broadcasts.registerReceiver(delivery, filter);
        List<ActivityTransition> requested = new ArrayList<>();
        for (int activity : new int[] { DetectedActivity.WALKING, DetectedActivity.RUNNING,
                DetectedActivity.ON_FOOT, DetectedActivity.STILL, DetectedActivity.IN_VEHICLE, DetectedActivity.ON_BICYCLE }) {
            for (int transition : new int[] { ActivityTransition.ACTIVITY_TRANSITION_ENTER, ActivityTransition.ACTIVITY_TRANSITION_EXIT }) {
                requested.add(new ActivityTransition.Builder().setActivityType(activity).setActivityTransition(transition).build());
            }
        }
        registration = retry(() -> client.requestActivityTransitionUpdates(new ActivityTransitionRequest(requested), transitions), 3)
            .continueWithTask(task -> {
                if (!task.isSuccessful()) throw failure(task);
                if (!active) return Tasks.forResult(null);
                sampling = true;
                handler.postDelayed(sampleTimeout, 30_000);
                return retry(() -> client.requestActivityUpdates(15_000, initialSample), 3).continueWithTask(sample -> {
                    if (!sample.isSuccessful()) throw failure(sample);
                    return active && sampling ? Tasks.forResult(null) : retry(() -> client.removeActivityUpdates(initialSample), 3);
                });
            });
        return registration;
    }

    static Task<Void> stopOrphan(Context context, Intent intent) {
        String action = intent.getAction();
        if (action == null || !action.startsWith(ACTION_PREFIX) || action.lastIndexOf('.') <= ACTION_PREFIX.length())
            return Tasks.forException(new IllegalArgumentException("Orphan motion callback has an invalid session action"));
        String session = action.substring(0, action.lastIndexOf('.'));
        List<Task<Void>> removals = new ArrayList<>();
        ActivityRecognitionClient client = ActivityRecognition.getClient(context);
        for (String phase : new String[] { ".transitions", ".sample" }) {
            int flags = PendingIntent.FLAG_NO_CREATE | (Build.VERSION.SDK_INT >= 31 ? PendingIntent.FLAG_MUTABLE : 0);
            PendingIntent pending = PendingIntent.getBroadcast(context, 0,
                new Intent(context, AndroidReminderMotionReceiver.class).setAction(session + phase), flags);
            if (pending == null) continue;
            removals.add(Tasks.whenAll(retry(() -> client.removeActivityTransitionUpdates(pending), 3),
                retry(() -> client.removeActivityUpdates(pending), 3)).addOnCompleteListener(ignored -> pending.cancel()));
        }
        return Tasks.whenAll(removals);
    }

    void onIntent(Intent intent) {
        if (!active) return;
        if (transitionAction.equals(intent.getAction())) {
            ActivityTransitionResult result = ActivityTransitionResult.extractResult(intent);
            if (result == null) { listener.onFailure(new IllegalArgumentException("Motion transition callback has no activity result")); return; }
            for (com.google.android.gms.location.ActivityTransitionEvent event : result.getTransitionEvents()) {
                if (event.getElapsedRealTimeNanos() < lastEventNanos) continue;
                lastEventNanos = event.getElapsedRealTimeNanos();
                activities = AndroidReminderMotionState.afterTransition(activities, activity(event.getActivityType()),
                    event.getTransitionType() == ActivityTransition.ACTIVITY_TRANSITION_ENTER
                        ? AndroidReminderMotionState.Transition.ENTER : AndroidReminderMotionState.Transition.EXIT);
            }
            listener.onMovementChanged(!activities.isEmpty());
        } else if (sampleAction.equals(intent.getAction())) {
            if (!sampling) return;
            ActivityRecognitionResult result = ActivityRecognitionResult.extractResult(intent);
            if (result == null) { listener.onFailure(new IllegalArgumentException("Initial motion callback has no activity result")); return; }
            stopInitialSample();
            long nanos = result.getElapsedRealtimeMillis() * 1_000_000;
            if (nanos < lastEventNanos) return;
            lastEventNanos = nanos;
            DetectedActivity detected = result.getMostProbableActivity();
            activities = AndroidReminderMotionState.fromActivity(activity(detected.getType()), detected.getConfidence());
            listener.onMovementChanged(!activities.isEmpty());
        }
    }

    private void stopInitialSample() {
        sampling = false;
        handler.removeCallbacks(sampleTimeout);
        retry(() -> client.removeActivityUpdates(initialSample), 3)
            .addOnFailureListener(error -> { if (active) listener.onFailure(error); });
    }

    Task<Void> stop() {
        active = false;
        broadcasts.unregisterReceiver(delivery);
        sampling = false;
        handler.removeCallbacks(sampleTimeout);
        return registration.continueWithTask(ignored -> Tasks.whenAll(
            retry(() -> client.removeActivityTransitionUpdates(transitions), 3),
            retry(() -> client.removeActivityUpdates(initialSample), 3)))
            .addOnCompleteListener(ignored -> { transitions.cancel(); initialSample.cancel(); });
    }

    private static Task<Void> retry(Supplier<Task<Void>> operation, int remaining) {
        try {
            return operation.get().continueWithTask(task -> {
                if (task.isSuccessful()) return task;
                if (remaining <= 1) throw failure(task);
                Logger.error("Motion service request failed; retrying", failure(task));
                return retry(operation, remaining - 1);
            });
        } catch (SecurityException error) {
            return Tasks.forException(error);
        }
    }

    private static Exception failure(Task<?> task) {
        return task.getException() != null ? task.getException() : new IllegalStateException("Motion service request was cancelled");
    }

    private static AndroidReminderMotionState.Activity activity(int type) {
        switch (type) {
            case DetectedActivity.WALKING: return AndroidReminderMotionState.Activity.WALKING;
            case DetectedActivity.RUNNING: return AndroidReminderMotionState.Activity.RUNNING;
            case DetectedActivity.ON_FOOT: return AndroidReminderMotionState.Activity.ON_FOOT;
            case DetectedActivity.STILL: return AndroidReminderMotionState.Activity.STILL;
            case DetectedActivity.IN_VEHICLE: return AndroidReminderMotionState.Activity.VEHICLE;
            case DetectedActivity.ON_BICYCLE: return AndroidReminderMotionState.Activity.BICYCLE;
            default: return AndroidReminderMotionState.Activity.UNKNOWN;
        }
    }
}
