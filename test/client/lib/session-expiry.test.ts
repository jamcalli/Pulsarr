import { describe, expect, it } from 'vitest'
import { isSessionExpired, LOGIN_PATH } from '@/lib/session-expiry'

describe('isSessionExpired', () => {
  it('treats a 401 from a protected endpoint as an expired session', () => {
    expect(isSessionExpired(401, '/v1/config', '/system/logs')).toBe(true)
  })

  it.each(['/v1/users/login', '/v1/users/create-admin'])(
    'ignores a 401 from the public auth endpoint %s',
    (path) => {
      expect(isSessionExpired(401, path, '/system/logs')).toBe(false)
    },
  )

  it('ignores responses that are not 401', () => {
    expect(isSessionExpired(403, '/v1/config', '/system/logs')).toBe(false)
    expect(isSessionExpired(500, '/v1/config', '/system/logs')).toBe(false)
  })

  it('does nothing while already on the login page', () => {
    expect(isSessionExpired(401, '/v1/config', LOGIN_PATH)).toBe(false)
  })
})
