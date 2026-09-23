import { describe, expect, it } from 'vitest'
import { isLeaderboardPath, shouldRedirectBrowserToLeaderboard } from './routes'

describe('browser routes', () => {
  it('serves the leaderboard only from its dedicated route', () => {
    expect(isLeaderboardPath('/leaderboard')).toBe(true)
    expect(isLeaderboardPath('/leaderboard/')).toBe(true)
    expect(isLeaderboardPath('/')).toBe(false)
  })

  it('redirects every browser at the app root to the leaderboard', () => {
    expect(shouldRedirectBrowserToLeaderboard('/', false)).toBe(true)
    expect(shouldRedirectBrowserToLeaderboard('/', true)).toBe(false)
  })

  it('does not redirect a browser that is already on the leaderboard', () => {
    expect(shouldRedirectBrowserToLeaderboard('/leaderboard', false)).toBe(false)
  })
})
