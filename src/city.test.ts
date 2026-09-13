import { describe, expect, it } from 'vitest'
import { cityAreaKm2, discoveredCityDistanceKm, discoveredCityPercentage, isPointInCity, type CityBoundary } from './city'
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

  it('does not increase coverage when the same place is discovered repeatedly', () => {
    const cell = pointToDiscoveryCell({ lng: 0, lat: 0, recordedAt: 1 })
    const repeatedVisit = { ...cell, discoveredAt: 2 }
    expect(discoveredCityPercentage([cell, repeatedVisit], city))
      .toBe(discoveredCityPercentage([cell], city))
  })

  it('counts only new discovery distance within a city', () => {
    const start = { lng: 0, lat: 0, recordedAt: 1 }
    const newGround = { lng: .001, lat: 0, recordedAt: 2 }
    const repeatStreet = { ...start, recordedAt: 3 }
    expect(discoveredCityDistanceKm([start, newGround, repeatStreet], city))
      .toBeCloseTo(.111, 2)
  })
})
