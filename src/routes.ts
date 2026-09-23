export function isLeaderboardPath(pathname: string) {
  return (pathname.replace(/\/+$/, '') || '/') === '/leaderboard'
}

export function isAppRootPath(pathname: string) {
  return (pathname.replace(/\/+$/, '') || '/') === '/'
}

export function shouldRedirectBrowserToLeaderboard(
  pathname: string,
  nativePlatform: boolean,
) {
  return !nativePlatform && isAppRootPath(pathname)
}
