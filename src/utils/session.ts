import type { FastifyRequest } from 'fastify'

/**
 * Creates a temporary admin session for authentication bypass scenarios
 * This is used when authentication is disabled globally or for local IPs
 *
 * @param request - The Fastify request object with session support
 */
export function createTemporaryAdminSession(request: FastifyRequest): void {
  request.session.user = {
    id: 0,
    email: 'auth-bypass@local',
    username: 'auth-bypass',
    role: 'admin',
  }
}
