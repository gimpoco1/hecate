export function isLeaderboardPath(pathname: string) {
  return (pathname.replace(/\/+$/, '') || '/') === '/leaderboard'
}

export function leaderboardCitySlugFromHash(hash: string): string | null {
  return decodeURIComponent(hash.replace(/^#/, '')) || null
}

export function leaderboardCitySlug(cityName: string): string {
  return cityName.toLowerCase().replace(/\s+/g, '-')
}

export function leaderboardCityHash(cityName: string | null): string {
  return cityName === null ? '' : `#${encodeURIComponent(leaderboardCitySlug(cityName))}`
}

export function isAppRootPath(pathname: string) {
  return (pathname.replace(/\/+$/, '') || '/') === '/'
}

export function shouldRedirectBrowserToLeaderboard(
  pathname: string,
  nativePlatform: boolean,
  developmentMode = false,
) {
  return !developmentMode && !nativePlatform && isAppRootPath(pathname)
}

const PRODUCTION_WEB_ORIGIN = 'https://hecate-eta.vercel.app'

export function publicLeaderboardUrl(currentOrigin: string) {
  const webOrigin = /^https?:\/\//i.test(currentOrigin)
    ? currentOrigin
    : PRODUCTION_WEB_ORIGIN
  return new URL('/leaderboard', webOrigin).toString()
}
