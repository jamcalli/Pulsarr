import type { FastifyRequest } from 'fastify'

/**
 * Populates the session with the admin user for auth-bypassed requests.
 *
 * This is a single-admin app and the admin is always user id 1, so the
 * hardcoded id attributes bypassed requests to the same user row as real
 * logins.
 */
export function createTemporaryAdminSession(request: FastifyRequest): void {
  request.session.user = {
    id: 1,
    email: 'admin@localhost',
    username: 'Administrator',
    role: 'admin',
  }
}
