package com.gimpoco.hecate;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import com.google.android.gms.location.ActivityRecognitionResult;
import com.google.android.gms.location.ActivityTransitionEvent;
import com.google.android.gms.location.ActivityTransitionResult;
import com.google.android.gms.location.DetectedActivity;
import android.os.SystemClock;
import java.util.Collections;

public class JourneyMotionReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context, Intent intent) {
        if (ActivityTransitionResult.hasResult(intent)) {
            ActivityTransitionResult transitions = ActivityTransitionResult.extractResult(intent);
            if (transitions == null) throw new IllegalArgumentException("Journey motion broadcast contains no transition result.");
            for (ActivityTransitionEvent event : transitions.getTransitionEvents()) {
                long elapsed = event.getElapsedRealTimeNanos() / 1_000_000;
                long time = System.currentTimeMillis() - (SystemClock.elapsedRealtime() - elapsed);
                JourneyMotionPlugin.receive(new ActivityRecognitionResult(
                    Collections.singletonList(new DetectedActivity(event.getActivityType(), 100)), time, elapsed));
            }
            return;
        }
        if (!ActivityRecognitionResult.hasResult(intent)) return;
        ActivityRecognitionResult result = ActivityRecognitionResult.extractResult(intent);
        if (result == null) throw new IllegalArgumentException("Journey motion broadcast contains no activity result.");
        JourneyMotionPlugin.receive(result);
    }
}
