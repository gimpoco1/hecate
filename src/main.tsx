import { lazy, StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { Capacitor } from '@capacitor/core'
import { initializeNativeAuthLinks } from './auth'
import { isLeaderboardPath, shouldRedirectBrowserToLeaderboard } from './routes'
import './styles.css'

const nativePlatform = Capacitor.isNativePlatform()
const redirectingBrowser = shouldRedirectBrowserToLeaderboard(
  window.location.pathname,
  nativePlatform,
)
if (redirectingBrowser) {
  window.location.replace(`/leaderboard${window.location.search}${window.location.hash}`)
}

const leaderboardRoute = !nativePlatform && (
  redirectingBrowser || isLeaderboardPath(window.location.pathname)
)
const RootExperience = leaderboardRoute
  ? lazy(() => import('./components/WebLeaderboard').then(module => ({ default: module.WebLeaderboard })))
  : lazy(() => import('./App'))

document.title = leaderboardRoute
  ? 'Hecate — Discovery leaderboard'
  : 'Hecate — Discover your world'
document.querySelector('meta[name="description"]')?.setAttribute(
  'content',
  leaderboardRoute
    ? 'See which Hecate explorers have uncovered the most new ground, overall and city by city.'
    : 'Track your walks, reveal new ground, and discover your world with Hecate.',
)

createRoot(document.getElementById('root')!).render(<StrictMode><Suspense fallback={null}><RootExperience /></Suspense></StrictMode>)
void initializeNativeAuthLinks()

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', async () => {
    const hadController = Boolean(navigator.serviceWorker.controller)
    let refreshing = false

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (hadController && !refreshing) {
        refreshing = true
        window.location.reload()
      }
    })

    try {
      const registration = await navigator.serviceWorker.register('/sw.js')
      await registration.update()
    } catch (error) {
      console.error('Service worker registration failed', error)
    }
  })
}
