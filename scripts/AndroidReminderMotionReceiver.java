package com.equimaps.capacitor_background_geolocation;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import androidx.localbroadcastmanager.content.LocalBroadcastManager;
import com.getcapacitor.Logger;

/** Delivers movement events to the live monitor without starting a background location service. */
public final class AndroidReminderMotionReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context, Intent intent) {
        if (LocalBroadcastManager.getInstance(context).sendBroadcast(new Intent(intent).setComponent(null))) return;
        PendingResult pending = goAsync();
        AndroidReminderMotionMonitor.stopOrphan(context, intent)
            .addOnFailureListener(error -> Logger.error("Could not remove orphan motion registration", error))
            .addOnCompleteListener(ignored -> pending.finish());
    }
}
