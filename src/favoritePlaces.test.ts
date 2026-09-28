import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createFavoritePlace, favoriteDirectionsUrl, favoriteNativeDirectionsUrl, favoritePlaceIconVector, favoritePlacesFromUnknown, loadFavoritePlaces, saveFavoritePlaces } from './favoritePlaces'

describe('favorite places', () => {
  beforeEach(() => {
    const values = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    })
  })

  it('keeps local favorites isolated by account', () => {
    const place = createFavoritePlace(41.4, 2.18)
    place.comment = 'Quiet courtyard'
    saveFavoritePlaces('first', [place])

    expect(loadFavoritePlaces('first')).toEqual([place])
    expect(loadFavoritePlaces('second')).toEqual([])
  })

  it('ignores malformed stored entries', () => {
    localStorage.setItem('hecate:favorite-places:v1:guest', JSON.stringify([
      createFavoritePlace(41.4, 2.18),
      { id: 'bad', lat: 999, lng: 2, comment: '', createdAt: 1, updatedAt: 1 },
    ]))

    expect(loadFavoritePlaces(null)).toHaveLength(1)
  })

  it('upgrades existing favorites to the default star icon', () => {
    const legacy = createFavoritePlace(41.4, 2.18) as Partial<ReturnType<typeof createFavoritePlace>>
    delete legacy.icon
    localStorage.setItem('hecate:favorite-places:v1:guest', JSON.stringify([legacy]))

    expect(loadFavoritePlaces(null)[0].icon).toBe('star')
  })

  it('validates account metadata before using it as favorites', () => {
    const place = createFavoritePlace(41.4, 2.18)

    expect(favoritePlacesFromUnknown([place, { id: 'invalid' }])).toEqual([place])
    expect(favoritePlacesFromUnknown('invalid')).toEqual([])
  })

  it('creates walking direction links from the saved coordinates', () => {
    const place = { lat: 41.4036, lng: 2.1744 }

    expect(favoriteDirectionsUrl('apple', place)).toBe(
      'https://maps.apple.com/?daddr=41.4036%2C2.1744&dirflg=w',
    )
    expect(favoriteDirectionsUrl('google', place)).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=41.4036%2C2.1744&travelmode=walking',
    )
    expect(favoriteNativeDirectionsUrl('apple', place)).toBe(
      'maps://?daddr=41.4036%2C2.1744&dirflg=w',
    )
    expect(favoriteNativeDirectionsUrl('google', place)).toBe(
      'comgooglemaps://?daddr=41.4036%2C2.1744&directionsmode=walking',
    )
  })

  it('adapts complete SVG assets while preserving their view box', () => {
    const vector = favoritePlaceIconVector('sports')

    expect(vector.viewBox).toBe('0 0 330 330')
    expect(vector.filled).toBe(true)
    expect(vector.markup).toContain('<path')
    expect(vector.markup).not.toContain('<svg')
  })
})
