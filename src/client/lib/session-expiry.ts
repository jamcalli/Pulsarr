import { api } from '@/lib/api'

const PUBLIC_AUTH_PATHS = ['/v1/users/login', '/v1/users/create-admin']

export const LOGIN_PATH = api('/login')

/** True when a response means the session is gone and the app should load the login page. */
export function isSessionExpired(
  status: number,
  requestPath: string,
  currentPath: string,
): boolean {
  if (status !== 401 || currentPath === LOGIN_PATH) return false
  return !PUBLIC_AUTH_PATHS.some((path) => requestPath.endsWith(path))
}

/** A full page load, so the server decides between login, create-user or straight back in. */
export function goToLogin(): void {
  window.location.assign(LOGIN_PATH)
}
