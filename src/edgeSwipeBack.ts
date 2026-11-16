import { useEffect } from "react";

const DIALOG_SELECTOR = 'dialog, [role="dialog"]';
const EDGE_WIDTH = 24;
const SWIPE_DISTANCE = 72;
const DIRECTION_THRESHOLD = 12;

type BackSwipe = {
  identifier: number;
  x: number;
  y: number;
  button: HTMLButtonElement;
};

/** Route left-edge touch swipes through the current dialog's existing back action. */
export function useEdgeSwipeBack(): void {
  useEffect(() => {
    let swipe: BackSwipe | null = null;

    const cancel = (): void => { swipe = null; };
    const start = (event: TouchEvent): void => {
      cancel();
      if (event.touches.length !== 1 || !(event.target instanceof Element)) return;
      const touch = event.touches[0];
      if (touch.clientX < 0 || touch.clientX > EDGE_WIDTH) return;
      const dialog = event.target.closest(DIALOG_SELECTOR) ??
        event.target.closest(".sheet-backdrop")?.querySelector(DIALOG_SELECTOR);
      if (!dialog || dialog.closest("[inert]")) return;
      const button = Array.from(dialog.querySelectorAll<HTMLButtonElement>("button[data-swipe-back]"))
        .find(candidate => candidate.closest(DIALOG_SELECTOR) === dialog);
      if (!button || button.disabled) return;
      swipe = { identifier: touch.identifier, x: touch.clientX, y: touch.clientY, button };
    };
    const move = (event: TouchEvent): void => {
      if (!swipe) return;
      if (event.touches.length !== 1) { cancel(); return; }
      const touch = event.touches[0];
      const dx = touch.clientX - swipe.x;
      const dy = Math.abs(touch.clientY - swipe.y);
      if (touch.identifier !== swipe.identifier || dx < -DIRECTION_THRESHOLD ||
        (dy > DIRECTION_THRESHOLD && dy >= dx)) {
        cancel();
        return;
      }
      if (dx > DIRECTION_THRESHOLD && dx > dy * 1.5 && event.cancelable) event.preventDefault();
    };
    const end = (event: TouchEvent): void => {
      const completed = swipe;
      cancel();
      if (!completed || event.touches.length !== 0) return;
      const touch = Array.from(event.changedTouches).find(item => item.identifier === completed.identifier);
      if (!touch) return;
      const dx = touch.clientX - completed.x;
      const dy = Math.abs(touch.clientY - completed.y);
      if (dx < SWIPE_DISTANCE || dx <= dy * 1.5 || !completed.button.isConnected ||
        completed.button.disabled || completed.button.closest("[inert]")) return;
      if (event.cancelable) event.preventDefault();
      completed.button.click();
    };

    document.addEventListener("touchstart", start, { capture: true, passive: true });
    document.addEventListener("touchmove", move, { capture: true, passive: false });
    document.addEventListener("touchend", end, { capture: true, passive: false });
    document.addEventListener("touchcancel", cancel, { capture: true, passive: true });
    return () => {
      document.removeEventListener("touchstart", start, true);
      document.removeEventListener("touchmove", move, true);
      document.removeEventListener("touchend", end, true);
      document.removeEventListener("touchcancel", cancel, true);
    };
  }, []);
}
