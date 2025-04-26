import type { FastifyRequest } from 'fastify'

/**
 * Assigns a temporary admin user to the session for authentication bypass scenarios.
 *
 * @remark
 * Intended for use when authentication is disabled globally or for local IP addresses. The session user is set with fixed admin credentials.
 *
 * @param request - The Fastify request object with session support.
 */
export function createTemporaryAdminSession(request: FastifyRequest): void {
  request.session.user = {
    id: 0,
    email: 'auth-bypass@local',
    username: 'auth-bypass',
    role: 'admin',
  }
}
