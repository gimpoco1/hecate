const JOURNEY_DRAG_THRESHOLD_PX = 32;
const JOURNEY_CONTENT_HIDE_THRESHOLD_PX = 6;

/** Translate a full-height sheet so only the requested height remains visible. */
export function journeySheetOffsetPx(
  expandedHeight: number,
  visibleHeight: number,
) {
  return expandedHeight - visibleHeight;
}

/** Keep the recap consistent with its whole-metre distance display. */
export function shouldShowExplorationRecap(newGroundKm: number) {
  return Math.round(Math.max(0, newGroundKm) * 1_000) > 0;
}

/**
 * A collapsed sheet opens only after a deliberate upward drag. An expanded
 * sheet stays open until it is deliberately dragged down.
 */
export function shouldExpandJourneySheet(
  wasExpanded: boolean,
  verticalDragPx: number,
) {
  return wasExpanded
    ? verticalDragPx <= JOURNEY_DRAG_THRESHOLD_PX
    : verticalDragPx <= -JOURNEY_DRAG_THRESHOLD_PX;
}

/**
/** The whole collapsed summary is a drag surface. Once expanded, only the
 * header can start a downward drag to close the sheet without interrupting the
 * list's scroll interaction. Keep the lower half of the header as a reserved
 * no-gesture zone so system swipe gestures can pass through.
 */
export function shouldStartJourneyDrag(
  wasExpanded: boolean,
  isHandle: boolean,
  isDiscoveryControl: boolean,
) {
  return !isDiscoveryControl && (!wasExpanded || isHandle);
}

export function shouldAllowHeaderGesture(
  headerHeight: number,
  pointerOffsetFromTop: number,
) {
  return pointerOffsetFromTop < headerHeight * 0.5;
}

/** Drop expensive drawer content as soon as an expanded sheet moves down. */
export function shouldHideJourneyContentDuringDrag(
  wasExpanded: boolean,
  verticalDragPx: number,
) {
  return wasExpanded && verticalDragPx > JOURNEY_CONTENT_HIDE_THRESHOLD_PX;
}

/** Keep the live city and achievement lists mounted even when the sheet is settled closed. */
export function shouldKeepJourneyContentMounted(
  isExpanded: boolean,
  verticalDragPx: number,
) {
  return (
    !isExpanded || Math.abs(verticalDragPx) <= JOURNEY_CONTENT_HIDE_THRESHOLD_PX
  );
}
