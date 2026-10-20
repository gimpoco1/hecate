package com.gimpoco.hecate;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;

public class JourneyActionReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context, Intent intent) {
        JourneyNotifications notifications = new JourneyNotifications(context);
        String walkId = intent.getStringExtra("walkId");
        if (walkId == null) throw new IllegalArgumentException("The Android journey action is missing its journey ID.");
        if (JourneyNotifications.EXPIRE.equals(intent.getAction())) {
            notifications.expireRecap(walkId);
            return;
        }
        if (JourneyNotifications.DEMOTE.equals(intent.getAction())) {
            JourneyState active = notifications.active();
            if (active != null && active.walkId().equals(walkId)) notifications.demote(walkId);
            return;
        }
        if (!JourneyNotifications.STOP.equals(intent.getAction()))
            throw new IllegalArgumentException("Unrecognized Android journey notification action.");
        JourneyState state = notifications.active();
        if (state == null || !state.walkId().equals(walkId)) return;
        JourneyState stopped = state.finish(Math.max(state.startedAt(), System.currentTimeMillis()));
        notifications.saveStop(stopped);
        PendingResult pending = goAsync();
        JourneyNotifications.withService(context, service -> {
            service.stopJourney(walkId);
            notifications.showRecap(stopped);
            context.sendBroadcast(new Intent(JourneyNotifications.STOPPED).setPackage(context.getPackageName()).putExtra("walkId", walkId));
            pending.finish();
        }, error -> {
            Log.e("HecateJourney", "Could not finish the Android notification stop action", error);
            context.sendBroadcast(new Intent(JourneyNotifications.STOPPED).setPackage(context.getPackageName()).putExtra("walkId", walkId));
            pending.finish();
        });
    }
}
