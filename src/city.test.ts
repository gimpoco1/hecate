import { describe, expect, it } from 'vitest'
import { cityAreaKm2, discoveredCityPercentage, isPointInCity, type CityBoundary } from './city'
import { pointToDiscoveryCell } from './geo'

const city: CityBoundary = {
  id: 'test:city',
  name: 'Test City',
  fetchedAt: 0,
  geometry: {
    type: 'Polygon',
    coordinates: [[[-.01, -.01], [.01, -.01], [.01, .01], [-.01, .01], [-.01, -.01]]],
  },
}

describe('city discovery', () => {
  it('checks whether points are inside the municipal polygon', () => {
    expect(isPointInCity({ lng: 0, lat: 0 }, city)).toBe(true)
    expect(isPointInCity({ lng: .02, lat: 0 }, city)).toBe(false)
  })

  it('calculates a plausible polygon area', () => {
    expect(cityAreaKm2(city)).toBeGreaterThan(4)
    expect(cityAreaKm2(city)).toBeLessThan(6)
  })

  it('turns revealed cells into a bounded percentage', () => {
    const cell = pointToDiscoveryCell({ lng: 0, lat: 0, recordedAt: 1 })
    const percentage = discoveredCityPercentage([cell], city)
    expect(percentage).toBeGreaterThan(0)
    expect(percentage).toBeLessThan(1)
  })
})
