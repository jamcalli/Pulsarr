import type { AdminUser } from '@schemas/auth/auth.js'
import type { FastifyRequest } from 'fastify'

/**
 * Populates the session with the admin user for auth-bypassed requests.
 *
 * Built from the sole admin row when one exists, so bypassed requests carry
 * the same identity as real logins. The hardcoded fallback covers fresh
 * instances where no admin has been created yet.
 */
export function createTemporaryAdminSession(
  request: FastifyRequest,
  adminUser?: AdminUser,
): void {
  request.session.user = adminUser
    ? {
        id: adminUser.id,
        email: adminUser.email,
        username: adminUser.username,
        role: adminUser.role,
      }
    : {
        id: 1,
        email: 'admin@localhost',
        username: 'Administrator',
        role: 'admin',
      }
}
