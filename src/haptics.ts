import { Capacitor } from "@capacitor/core";
import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";
import { errorDiagnostic } from "./diagnostics";

function playHaptic(feedback: string, play: () => Promise<void>): void {
  if (!Capacitor.isNativePlatform() || document.visibilityState !== "visible") return;
  void play().catch((error) => {
    console.error("Could not play native haptic feedback", { feedback, error: errorDiagnostic(error) });
  });
}

/** A light tick for deliberate selections, without vibrating on map movement. */
export function selectionHaptic(): void {
  playHaptic("selection", () => Haptics.impact({ style: ImpactStyle.Light }));
}

/** Marks a journey starting after its location watcher has registered. */
export function journeyStartHaptic(): void {
  playHaptic("journey-start", () => Haptics.impact({ style: ImpactStyle.Medium }));
}

/** Confirms a completed action after its local save succeeds. */
export function successHaptic(): void {
  playHaptic("success", () => Haptics.notification({ type: NotificationType.Success }));
}

/** Accompanies a visible failure without interrupting its error handling. */
export function errorHaptic(): void {
  playHaptic("error", () => Haptics.notification({ type: NotificationType.Error }));
}
