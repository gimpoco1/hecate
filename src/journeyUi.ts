const JOURNEY_DRAG_THRESHOLD_PX = 32

/** Translate a full-height sheet so only the requested height remains visible. */
export function journeySheetOffsetPx(expandedHeight: number, visibleHeight: number) {
  return expandedHeight - visibleHeight
}

/** Keep the recap consistent with its whole-metre distance display. */
export function shouldShowExplorationRecap(newGroundKm: number) {
  return Math.round(Math.max(0, newGroundKm) * 1_000) > 0
}

/**
 * A collapsed sheet opens only after a deliberate upward drag. An expanded
 * sheet stays open until it is deliberately dragged down.
 */
export function shouldExpandJourneySheet(wasExpanded: boolean, verticalDragPx: number) {
  return wasExpanded
    ? verticalDragPx <= JOURNEY_DRAG_THRESHOLD_PX
    : verticalDragPx <= -JOURNEY_DRAG_THRESHOLD_PX
}

/**
 * The whole collapsed summary is a drag surface. Once expanded, keep dragging
 * on the handle so the city list remains independently scrollable.
 */
export function shouldStartJourneyDrag(wasExpanded: boolean, isHandle: boolean, isDiscoveryControl: boolean) {
  return !isDiscoveryControl && (!wasExpanded || isHandle)
}
