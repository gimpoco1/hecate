import { App as CapacitorApp } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { supabase } from './storage'

const NATIVE_AUTH_CALLBACK = 'https://hecate-eta.vercel.app/auth/callback'

export function authRedirectUrl(): string {
  return Capacitor.isNativePlatform()
    ? NATIVE_AUTH_CALLBACK
    : new URL('/auth/web-callback', window.location.origin).toString()
}

/** Only a PKCE code can complete a sign-in initiated by this installation. */
export function authCallbackCode(url: string, webOrigin: string): string | null {
  const callback = new URL(url)
  const nativeCallback = new URL(NATIVE_AUTH_CALLBACK)
  const isNativeCallback = (callback.origin === nativeCallback.origin && callback.pathname === nativeCallback.pathname)
  const isWebCallback = callback.origin === webOrigin && callback.pathname === '/auth/web-callback'
  if (!isNativeCallback && !isWebCallback) return null
  if (callback.hash || callback.searchParams.has('access_token') || callback.searchParams.has('refresh_token')) {
    throw new Error('This sign-in link is no longer supported. Request a new link from Hecate.')
  }
  const code = callback.searchParams.get('code')
  if (!code || code.length > 2048) throw new Error('The sign-in link has no valid authorization code. Request a new link from Hecate.')
  return code
}

export async function handleAuthCallback(url: string): Promise<boolean> {
  const code = authCallbackCode(url, window.location.origin)
  if (code === null) return false
  if (!supabase) throw new Error('Account sign-in is not configured in this build.')
  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) throw new Error('The sign-in link expired or was opened outside the app or browser that requested it. Request a new link from Hecate.')
  return true
}

export async function initializeWebAuth(): Promise<void> {
  if (Capacitor.isNativePlatform()) return
  if (!['/auth/callback', '/auth/web-callback'].includes(window.location.pathname)) return
  const url = window.location.href
  // Remove the one-time code even when exchange fails so it cannot linger in history.
  window.history.replaceState(null, '', '/leaderboard')
  await handleAuthCallback(url)
}

export async function initializeNativeAuthLinks() {
  if (!Capacitor.isNativePlatform() || !supabase) return

  const handledUrls = new Set<string>()
  const openCallback = (url: string) => {
    if (handledUrls.has(url)) return
    handledUrls.add(url)
    void handleAuthCallback(url).catch(error => {
      handledUrls.delete(url)
      console.error('Authentication callback failed', { errorType: error instanceof Error ? error.name : 'InvalidCallback' })
      window.dispatchEvent(new CustomEvent('hecate:auth-error', { detail: 'Sign-in failed. Request a new link from Hecate on this device.' }))
    })
  }
  // Subscribe before reading the launch URL so a callback arriving during app
  // startup cannot fall into the gap between those two operations.
  await CapacitorApp.addListener('appUrlOpen', event => openCallback(event.url))
  const launch = await CapacitorApp.getLaunchUrl()
  if (launch?.url) openCallback(launch.url)
}
