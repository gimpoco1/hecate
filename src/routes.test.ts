import { describe, expect, it } from 'vitest'
import { hostedLeaderboardUrl, isLeaderboardPath, leaderboardCityHash, leaderboardCitySlugFromHash, publicLeaderboardUrl, shouldRedirectBrowserToLeaderboard } from './routes'

describe('browser routes', () => {
  it('uses card city names with spaces replaced by dashes in shareable links', () => {
    expect(leaderboardCityHash('Barcelona')).toBe('#barcelona')
    expect(leaderboardCityHash('Greater London')).toBe('#greater-london')
    const cityName = 'Dún Laoghaire-Rathdown'
    expect(leaderboardCitySlugFromHash(leaderboardCityHash(cityName))).toBe('dún-laoghaire-rathdown')
    expect(leaderboardCitySlugFromHash(leaderboardCityHash('City & Coast'))).toBe('city-&-coast')
    expect(leaderboardCityHash(null)).toBe('')
    expect(leaderboardCitySlugFromHash('')).toBeNull()
  })

  it('serves the leaderboard only from its dedicated route', () => {
    expect(isLeaderboardPath('/leaderboard')).toBe(true)
    expect(isLeaderboardPath('/leaderboard/')).toBe(true)
    expect(isLeaderboardPath('/')).toBe(false)
  })

  it('redirects production browsers at the app root to the leaderboard', () => {
    expect(shouldRedirectBrowserToLeaderboard('/', false)).toBe(true)
    expect(shouldRedirectBrowserToLeaderboard('/', true)).toBe(false)
  })

  it('keeps the app root available in browser development mode', () => {
    expect(shouldRedirectBrowserToLeaderboard('/', false, true)).toBe(false)
    expect(shouldRedirectBrowserToLeaderboard('/leaderboard', false, true)).toBe(false)
  })

  it('does not redirect a browser that is already on the leaderboard', () => {
    expect(shouldRedirectBrowserToLeaderboard('/leaderboard', false)).toBe(false)
  })

  it('opens the hosted leaderboard from the native app', () => {
    expect(hostedLeaderboardUrl()).toBe(
      'https://hecate-eta.vercel.app/leaderboard',
    )
  })

  it('keeps the current browser origin while developing locally', () => {
    expect(publicLeaderboardUrl('http://localhost:5173')).toBe(
      'http://localhost:5173/leaderboard',
    )
  })
})
