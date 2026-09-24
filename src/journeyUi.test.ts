import { describe, expect, it } from 'vitest'
import { journeySheetOffsetPx, shouldExpandJourneySheet, shouldShowExplorationRecap, shouldStartJourneyDrag } from './journeyUi'

describe('exploration recap visibility', () => {
  it('hides journeys whose displayed new-ground distance is zero', () => {
    expect(shouldShowExplorationRecap(0)).toBe(false)
    expect(shouldShowExplorationRecap(0.00049)).toBe(false)
  })

  it('shows journeys with at least one displayed metre of new ground', () => {
    expect(shouldShowExplorationRecap(0.0005)).toBe(true)
  })
})

describe('journey drawer gesture', () => {
  it('slides a full-height sheet without resizing its layout', () => {
    expect(journeySheetOffsetPx(700, 108)).toBe(592)
    expect(journeySheetOffsetPx(700, 700)).toBe(0)
    expect(journeySheetOffsetPx(700, 714)).toBe(-14)
  })

  it('uses the full collapsed drawer except the start/stop control', () => {
    expect(shouldStartJourneyDrag(false, false, false)).toBe(true)
    expect(shouldStartJourneyDrag(false, false, true)).toBe(false)
  })

  it('keeps expanded drawer gestures on the handle', () => {
    expect(shouldStartJourneyDrag(true, true, false)).toBe(true)
    expect(shouldStartJourneyDrag(true, false, false)).toBe(false)
  })

  it('opens a collapsed drawer only for a deliberate upward drag', () => {
    expect(shouldExpandJourneySheet(false, -40)).toBe(true)
    expect(shouldExpandJourneySheet(false, -10)).toBe(false)
    expect(shouldExpandJourneySheet(false, 40)).toBe(false)
  })

  it('closes an expanded drawer after a deliberate downward drag', () => {
    expect(shouldExpandJourneySheet(true, 40)).toBe(false)
    expect(shouldExpandJourneySheet(true, 10)).toBe(true)
  })
})
