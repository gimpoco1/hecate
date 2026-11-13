package com.gimpoco.hecate;

import android.Manifest;
import android.app.PendingIntent;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.location.ActivityRecognition;
import com.google.android.gms.location.ActivityRecognitionResult;
import com.google.android.gms.location.ActivityTransition;
import com.google.android.gms.location.ActivityTransitionRequest;
import com.google.android.gms.location.DetectedActivity;
import com.google.android.gms.tasks.Task;
import com.google.android.gms.tasks.Tasks;
import java.lang.ref.WeakReference;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Supplier;
import java.util.concurrent.CancellationException;
import org.json.JSONObject;

@CapacitorPlugin(name = "JourneyMotion")
public class JourneyMotionPlugin extends Plugin {
    private static volatile WeakReference<JourneyMotionPlugin> instance = new WeakReference<>(null);
    private volatile JSObject latest;
    private volatile boolean active;
    private String latestActivity;
    private long latestSince;

    private PendingIntent updatesIntent() {
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) flags |= PendingIntent.FLAG_MUTABLE;
        return PendingIntent.getBroadcast(getContext(), 8451,
            new Intent(getContext(), JourneyMotionReceiver.class).setAction("com.gimpoco.hecate.JOURNEY_MOTION"), flags);
    }

    private boolean permitted() {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.Q || ContextCompat.checkSelfPermission(
            getContext(), Manifest.permission.ACTIVITY_RECOGNITION) == PackageManager.PERMISSION_GRANTED;
    }

    private Task<Void> removeSubscriptions() {
        return retryOperation(() -> Tasks.whenAll(
            ActivityRecognition.getClient(getContext()).removeActivityUpdates(updatesIntent()),
            ActivityRecognition.getClient(getContext()).removeActivityTransitionUpdates(updatesIntent())), 1);
    }

    private Task<Void> retryOperation(Supplier<Task<Void>> operation, int attempt) {
        Task<Void> current;
        try { current = operation.get(); }
        catch (SecurityException error) { current = Tasks.forException(error); }
        return current.continueWithTask(task -> {
            if (task.isSuccessful()) return Tasks.forResult(null);
            Exception error = task.getException() != null ? task.getException() : new CancellationException("Motion operation was cancelled.");
            if (attempt == 3) throw error;
            android.util.Log.w("HecateJourneyMotion", "Retrying motion service operation", error);
            return retryOperation(operation, attempt + 1);
        });
    }

    @PluginMethod public void start(PluginCall call) {
        if (!permitted()) { call.reject("Allow Physical activity in Hecate's device settings.", "MOTION_NOT_AUTHORIZED"); return; }
        instance = new WeakReference<>(this);
        latest = null;
        latestActivity = null;
        latestSince = 0;
        active = true;
        List<ActivityTransition> transitions = new ArrayList<>();
        for (int type : new int[] { DetectedActivity.WALKING, DetectedActivity.RUNNING, DetectedActivity.ON_BICYCLE, DetectedActivity.STILL, DetectedActivity.IN_VEHICLE }) {
            transitions.add(new ActivityTransition.Builder().setActivityType(type)
                .setActivityTransition(ActivityTransition.ACTIVITY_TRANSITION_ENTER).build());
        }
        retryOperation(() -> ActivityRecognition.getClient(getContext()).requestActivityUpdates(10_000, updatesIntent())
            .continueWithTask(task -> {
                if (!task.isSuccessful()) throw task.getException() != null ? task.getException() : new IllegalStateException("Activity recognition registration was cancelled.");
                if (!active) throw new CancellationException("Journey motion registration was stopped.");
                return ActivityRecognition.getClient(getContext()).requestActivityTransitionUpdates(new ActivityTransitionRequest(transitions), updatesIntent());
            }), 1)
            .addOnSuccessListener(result -> {
                if (active) call.resolve();
                else removeSubscriptions().addOnCompleteListener(cleanup -> call.reject("Journey motion registration was stopped."));
            })
            .addOnFailureListener(error -> {
                active = false;
                removeSubscriptions().addOnCompleteListener(cleanup -> {
                    if (!cleanup.isSuccessful()) android.util.Log.e("HecateJourneyMotion", "Could not remove partial motion registration", cleanup.getException());
                    call.reject("Could not start journey motion recognition: " + error.getMessage(), error);
                });
            });
    }

    static void receive(ActivityRecognitionResult result) {
        JourneyMotionPlugin plugin = instance.get();
        if (plugin != null && plugin.active) plugin.observe(result);
    }

    private void observe(ActivityRecognitionResult result) {
        if (result.getTime() < latestSince) return;
        DetectedActivity detected = result.getMostProbableActivity();
        String activity;
        if (detected.getConfidence() < 60) activity = "unknown";
        else switch (detected.getType()) {
            case DetectedActivity.WALKING:
            case DetectedActivity.RUNNING:
            case DetectedActivity.ON_FOOT: activity = "walking"; break;
            case DetectedActivity.ON_BICYCLE: activity = "cycling"; break;
            case DetectedActivity.STILL: activity = "stationary"; break;
            case DetectedActivity.IN_VEHICLE: activity = "other"; break;
            default: activity = "unknown";
        }
        long since = activity.equals(latestActivity) ? latestSince : result.getTime();
        latestActivity = activity;
        latestSince = since;
        JSObject sample = new JSObject();
        sample.put("activity", activity);
        sample.put("since", since);
        latest = sample;
        notifyListeners("motion", sample, true);
    }

    @PluginMethod public void getState(PluginCall call) {
        if (!permitted()) { call.reject("Physical activity access was revoked. Enable it in Settings.", "MOTION_NOT_AUTHORIZED"); return; }
        JSObject result = new JSObject();
        result.put("motion", latest == null ? JSONObject.NULL : latest);
        call.resolve(result);
    }

    @PluginMethod public void stop(PluginCall call) {
        active = false;
        latest = null;
        removeSubscriptions()
            .addOnSuccessListener(result -> call.resolve())
            .addOnFailureListener(error -> call.reject("Could not stop journey motion recognition: " + error.getMessage(), error));
    }

    @Override protected void handleOnDestroy() {
        active = false;
        removeSubscriptions()
            .addOnFailureListener(error -> android.util.Log.e("HecateJourneyMotion", "Could not remove destroyed motion transitions", error));
    }
}
