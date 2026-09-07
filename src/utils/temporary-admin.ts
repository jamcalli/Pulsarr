import type { AdminUser } from '@schemas/auth/auth.js'
import type { FastifyRequest } from 'fastify'

export function assignTemporaryAdminUser(
  request: FastifyRequest,
  adminUser?: AdminUser,
): void {
  request.user = adminUser
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
