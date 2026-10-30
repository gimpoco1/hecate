package com.gimpoco.hecate;

import static org.junit.Assert.*;
import org.junit.Test;
import java.util.Locale;

public class JourneyStateTest {
    @Test public void validatesMetricsAndElapsedTimeBoundaries() {
        long startedAt = 1000;
        JourneyState state = new JourneyState("walk", "owner", startedAt, 0, null, null);
        assertEquals("1,50 km", new JourneyState("walk", "owner", startedAt, 1.5, null, null).distanceLabel(Locale.ITALIAN));
        assertEquals("0:59", state.finish(startedAt + 59_999).elapsedLabel(Locale.ENGLISH));
        assertEquals("1:00", state.finish(startedAt + 60_000).elapsedLabel(Locale.ENGLISH));
        assertEquals("1:00:00", state.finish(startedAt + 3_600_000).elapsedLabel(Locale.ENGLISH));
        assertThrows(IllegalArgumentException.class, () -> state.finish(startedAt - 1));
        assertThrows(IllegalArgumentException.class, () -> new JourneyState("walk", "owner", startedAt, Double.NaN, null, null));
        assertThrows(IllegalArgumentException.class, () -> new JourneyState("walk", "owner", startedAt, 0, Double.POSITIVE_INFINITY, null));
        assertThrows(IllegalStateException.class, () -> state.elapsedLabel(Locale.ENGLISH));
    }
}
