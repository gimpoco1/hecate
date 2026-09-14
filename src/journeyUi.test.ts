import { describe, expect, it } from 'vitest'
import { shouldExpandJourneySheet, shouldShowExplorationRecap } from './journeyUi'

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
