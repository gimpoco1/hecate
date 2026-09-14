import { App as CapacitorApp } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { supabase } from './storage'

const NATIVE_AUTH_CALLBACK = 'hecate://auth/callback'

export function authRedirectUrl() {
  return Capacitor.isNativePlatform()
    ? NATIVE_AUTH_CALLBACK
    : new URL('/', window.location.origin).toString()
}

export async function handleAuthCallback(url: string) {
  if (!supabase) return false
  const callback = new URL(url)
  const isNativeCallback = callback.protocol === 'hecate:' && callback.host === 'auth'
  const isWebCallback = callback.origin === window.location.origin
  if (!isNativeCallback && !isWebCallback) return false

  const hash = new URLSearchParams(callback.hash.replace(/^#/, ''))
  const query = callback.searchParams
  const code = query.get('code')
  const accessToken = hash.get('access_token') ?? query.get('access_token')
  const refreshToken = hash.get('refresh_token') ?? query.get('refresh_token')

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) throw error
    return true
  }
  if (accessToken && refreshToken) {
    const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
    if (error) throw error
    return true
  }
  return false
}

export async function initializeNativeAuthLinks() {
  if (!Capacitor.isNativePlatform() || !supabase) return

  const handledUrls = new Set<string>()
  const openCallback = (url: string) => {
    if (handledUrls.has(url)) return
    handledUrls.add(url)
    void handleAuthCallback(url).catch(error => {
      handledUrls.delete(url)
      console.error('Authentication callback failed', error)
    })
  }
  // Subscribe before reading the launch URL so a callback arriving during app
  // startup cannot fall into the gap between those two operations.
  await CapacitorApp.addListener('appUrlOpen', event => openCallback(event.url))
  const launch = await CapacitorApp.getLaunchUrl()
  if (launch?.url) openCallback(launch.url)
}
