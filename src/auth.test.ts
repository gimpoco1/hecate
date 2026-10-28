import { describe, expect, it } from 'vitest'
import { authCallbackCode } from './auth'

const origin = 'https://hecate-eta.vercel.app'

describe('authentication callback boundary', () => {
  it('accepts only code callbacks on the exact associated or browser callback path', () => {
    expect(authCallbackCode(`${origin}/auth/callback?code=one-use-code`, 'capacitor://localhost')).toBe('one-use-code')
    expect(authCallbackCode(`${origin}/auth/web-callback?code=browser-code`, origin)).toBe('browser-code')
    expect(authCallbackCode('https://attacker.invalid/auth/callback?code=bad', origin)).toBeNull()
    expect(authCallbackCode(`${origin}/auth/callback/other?code=bad`, origin)).toBeNull()
    expect(authCallbackCode('hecate://auth/callback?code=bad', origin)).toBeNull()
    expect(authCallbackCode(`${origin}/leaderboard?code=bad`, origin)).toBeNull()
  })

  it('rejects supplied session tokens and missing codes before touching the auth client', () => {
    expect(() => authCallbackCode(`${origin}/auth/callback#access_token=attacker&refresh_token=attacker`, origin)).toThrow()
    expect(() => authCallbackCode(`${origin}/auth/callback?code=unused&access_token=attacker&refresh_token=attacker`, origin)).toThrow()
    expect(() => authCallbackCode(`${origin}/auth/callback`, origin)).toThrow()
  })
})
