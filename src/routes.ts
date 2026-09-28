export function isLeaderboardPath(pathname: string) {
  return (pathname.replace(/\/+$/, '') || '/') === '/leaderboard'
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
