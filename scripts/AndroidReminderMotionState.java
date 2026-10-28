package com.equimaps.capacitor_background_geolocation;

import java.util.Collections;
import java.util.HashSet;
import java.util.Set;

/** Pure activity decisions shared by the native motion connector and its regression tests. */
public final class AndroidReminderMotionState {
    public enum Activity { WALKING, RUNNING, ON_FOOT, STILL, VEHICLE, BICYCLE, UNKNOWN }
    public enum Transition { ENTER, EXIT }

    private AndroidReminderMotionState() {}

    private static boolean isWalkingActivity(Activity activity) {
        return activity == Activity.WALKING || activity == Activity.RUNNING || activity == Activity.ON_FOOT;
    }

    public static Set<Activity> fromActivity(Activity activity, int confidence) {
        return confidence >= 60 && isWalkingActivity(activity)
            ? Collections.singleton(activity) : Collections.emptySet();
    }

    public static Set<Activity> afterTransition(Set<Activity> previous, Activity activity, Transition transition) {
        Set<Activity> next = new HashSet<>(previous);
        if (transition == Transition.ENTER && !isWalkingActivity(activity)) next.clear();
        else if (transition == Transition.ENTER) next.add(activity);
        else next.remove(activity);
        return Collections.unmodifiableSet(next);
    }
}
