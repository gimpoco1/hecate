import { describe, expect, it } from 'vitest'
import { authCallbackCode, googleSessionCallbackCode, isSignInCancellation } from './auth'

const origin = 'https://hecate-explore.vercel.app'

describe('authentication callback boundary', () => {
  it('accepts only code callbacks on the exact associated or browser callback path', () => {
    expect(authCallbackCode(`${origin}/auth/callback?code=one-use-code`, 'capacitor://localhost')).toBe('one-use-code')
    expect(authCallbackCode(`${origin}/auth/web-callback?code=browser-code`, origin)).toBe('browser-code')
    expect(authCallbackCode('https://attacker.invalid/auth/callback?code=bad', origin)).toBeNull()
    expect(authCallbackCode(`${origin}/auth/callback/other?code=bad`, origin)).toBeNull()
    expect(authCallbackCode('hecate://auth/callback?code=bad', origin)).toBeNull()
    expect(authCallbackCode('com.gimpoco.hecate.auth://callback?code=bad', origin)).toBeNull()
    expect(authCallbackCode(`${origin}/leaderboard?code=bad`, origin)).toBeNull()
  })

  it('rejects supplied session tokens and missing codes before touching the auth client', () => {
    expect(() => authCallbackCode(`${origin}/auth/callback#access_token=attacker&refresh_token=attacker`, origin)).toThrow()
    expect(() => authCallbackCode(`${origin}/auth/callback?code=unused&access_token=attacker&refresh_token=attacker`, origin)).toThrow()
    expect(() => authCallbackCode(`${origin}/auth/callback`, origin)).toThrow()
  })

  it('recognizes cancellation only on trusted callbacks and keeps provider details private', () => {
    try {
      authCallbackCode(`${origin}/auth/web-callback?error=access_denied`, origin)
      throw new Error('Expected cancellation')
    } catch (error) {
      expect(isSignInCancellation(error)).toBe(true)
    }
    expect(authCallbackCode('https://attacker.invalid/auth/web-callback?error=access_denied', origin)).toBeNull()
    expect(() => authCallbackCode(`${origin}/auth/web-callback?error=server_error&error_description=private-details`, origin))
      .toThrow('Sign-in could not be completed. Please try again from Hecate.')
    expect(isSignInCancellation(new Error('Provider failed'))).toBe(false)
  })
})

describe('iOS Google authentication session callback', () => {
  it('accepts a code only at the exact private session callback', () => {
    expect(googleSessionCallbackCode('com.gimpoco.hecate.auth://callback?code=one-use-code')).toBe('one-use-code')
    expect(googleSessionCallbackCode('com.gimpoco.hecate.auth://callback/?code=one-use-code')).toBe('one-use-code')
    expect(googleSessionCallbackCode('com.gimpoco.hecate.auth://callback?code=one-use-code#')).toBe('one-use-code')
    expect(googleSessionCallbackCode('com.gimpoco.hecate.auth://callback/?code=one-use-code#')).toBe('one-use-code')
    for (const url of ['https://attacker.invalid/callback?code=bad',
      'com.gimpoco.hecate.auth://other?code=bad', 'com.gimpoco.hecate.auth://callback/other?code=bad',
      'com.gimpoco.hecate.auth://user@callback?code=bad', 'com.gimpoco.hecate.auth://callback:123?code=bad']) {
      expect(() => googleSessionCallbackCode(url)).toThrow('unexpected sign-in callback')
    }
  })

  it('rejects session tokens, fragments, missing codes, and oversized codes', () => {
    for (const suffix of ['?access_token=bad', '?code=code&refresh_token=bad', '?code=code#access_token=bad', '/?code=code#access_token=bad', '', `?code=${'a'.repeat(2049)}`]) {
      expect(() => googleSessionCallbackCode(`com.gimpoco.hecate.auth://callback${suffix}`)).toThrow()
    }
  })

  it('reports cancellation without treating it as a failed sign-in', () => {
    try {
      googleSessionCallbackCode('com.gimpoco.hecate.auth://callback?error=access_denied')
      throw new Error('Expected cancellation')
    } catch (error) {
      expect(isSignInCancellation(error)).toBe(true)
    }
  })
})
