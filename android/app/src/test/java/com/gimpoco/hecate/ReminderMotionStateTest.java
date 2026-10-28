package com.gimpoco.hecate;

import static org.junit.Assert.*;
import com.equimaps.capacitor_background_geolocation.AndroidReminderMotionState;
import com.equimaps.capacitor_background_geolocation.AndroidReminderMotionState.Activity;
import com.equimaps.capacitor_background_geolocation.AndroidReminderMotionState.Transition;
import java.util.Collections;
import java.util.Set;
import org.junit.Test;

public class ReminderMotionStateTest {
    @Test public void initialRecognitionRequiresConfidentWalking() {
        assertFalse(AndroidReminderMotionState.fromActivity(Activity.WALKING, 80).isEmpty());
        assertFalse(AndroidReminderMotionState.fromActivity(Activity.RUNNING, 80).isEmpty());
        assertTrue(AndroidReminderMotionState.fromActivity(Activity.WALKING, 30).isEmpty());
        for (Activity idle : new Activity[] { Activity.STILL, Activity.VEHICLE, Activity.BICYCLE, Activity.UNKNOWN })
            assertTrue(AndroidReminderMotionState.fromActivity(idle, 100).isEmpty());
    }

    @Test public void changingFromWalkingToRunningDoesNotStopMoving() {
        Set<Activity> initial = Collections.singleton(Activity.WALKING);
        Set<Activity> running = AndroidReminderMotionState.afterTransition(initial, Activity.RUNNING, Transition.ENTER);
        Set<Activity> afterWalkingExit = AndroidReminderMotionState.afterTransition(running, Activity.WALKING, Transition.EXIT);
        assertEquals(Collections.singleton(Activity.RUNNING), afterWalkingExit);
        assertEquals(Collections.singleton(Activity.WALKING), initial);
        assertTrue(AndroidReminderMotionState.afterTransition(afterWalkingExit, Activity.RUNNING, Transition.EXIT).isEmpty());
    }

    @Test public void stationaryAndVehicleTransitionsStopReminderGps() {
        Set<Activity> moving = Collections.singleton(Activity.ON_FOOT);
        for (Activity stopped : new Activity[] { Activity.STILL, Activity.VEHICLE, Activity.BICYCLE, Activity.UNKNOWN }) {
            Set<Activity> idle = AndroidReminderMotionState.afterTransition(moving, stopped, Transition.ENTER);
            assertTrue(idle.isEmpty());
            assertTrue(AndroidReminderMotionState.afterTransition(idle, Activity.ON_FOOT, Transition.EXIT).isEmpty());
        }
    }
}
