package com.gimpoco.hecate;

import java.util.Locale;

record JourneyState(String walkId, String ownerId, long startedAt, double distanceKm,
                    Double newAreaPercentage, Long finishedAt) {
    JourneyState {
        if (walkId == null || walkId.trim().isEmpty() || ownerId == null || ownerId.trim().isEmpty())
            throw new IllegalArgumentException("Journey and owner IDs are required.");
        if (startedAt <= 0 || !Double.isFinite(distanceKm) || distanceKm < 0 ||
            (newAreaPercentage != null && (!Double.isFinite(newAreaPercentage) || newAreaPercentage < 0)) ||
            (finishedAt != null && finishedAt < startedAt))
            throw new IllegalArgumentException("Journey timestamps, distance, or new-area percentage are invalid.");
    }

    JourneyState finish(long timestamp) {
        return new JourneyState(walkId, ownerId, startedAt, distanceKm, newAreaPercentage, timestamp);
    }

    String distanceLabel() {
        return distanceKm < 1 ? Math.round(distanceKm * 1000) + " m" : String.format(Locale.getDefault(), "%.2f km", distanceKm);
    }

    String metricsLabel() {
        return distanceLabel() + (finishedAt == null ? " this walk" : " walked") +
            (newAreaPercentage == null ? "" : String.format(Locale.getDefault(), " · +%.2f%% new area", newAreaPercentage));
    }

    String elapsedLabel() {
        if (finishedAt == null) throw new IllegalStateException("An active journey uses the system chronometer.");
        long seconds = (finishedAt - startedAt) / 1000;
        return seconds >= 3600 ? String.format(Locale.getDefault(), "%d:%02d:%02d", seconds / 3600, seconds / 60 % 60, seconds % 60) :
            String.format(Locale.getDefault(), "%d:%02d", seconds / 60, seconds % 60);
    }
}
