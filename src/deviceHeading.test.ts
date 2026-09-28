import { describe, expect, it } from 'vitest'
import { compassHeadingFromEvent, type CompassOrientationEvent } from './deviceHeading'

describe('device compass heading', () => {
  it('prefers the iOS compass heading while stationary', () => {
    expect(compassHeadingFromEvent({ webkitCompassHeading: 92 } as CompassOrientationEvent)).toBe(92)
  })

  it('converts absolute device orientation into clockwise compass degrees', () => {
    expect(compassHeadingFromEvent({ absolute: true, alpha: 45 } as CompassOrientationEvent)).toBe(315)
  })

  it('does not invent a direction from relative orientation data', () => {
    expect(compassHeadingFromEvent({ absolute: false, alpha: 45 } as CompassOrientationEvent)).toBeUndefined()
  })
})
