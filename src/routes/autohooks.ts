import type { FastifyInstance } from 'fastify'
import { getAuthBypassStatus } from '@utils/auth-bypass.js'

export default async function (fastify: FastifyInstance) {
  fastify.addHook('onRequest', async (request, reply) => {
    const publicPaths = [
      '/v1/users/login',
      '/v1/users/create-admin',
      '/v1/notifications/webhook',
    ]

    // Skip authentication for public paths
    if (publicPaths.some((path) => request.url.startsWith(path))) {
      return
    }

    // Check if auth should be bypassed based on config and IP
    const { shouldBypass, isAuthDisabled, isLocalBypass } = getAuthBypassStatus(
      fastify,
      request,
    )

    if (shouldBypass) {
      if (isAuthDisabled) {
        fastify.log.debug(
          { url: request.url },
          'Authentication disabled globally',
        )
      } else if (isLocalBypass) {
        fastify.log.debug(
          { ip: request.ip, url: request.url },
          'Bypassing authentication for local address',
        )
      }
      return
    }

    // Regular authentication check for all other cases
    if (!request.session.user) {
      reply.unauthorized('You must be authenticated to access this route.')
    }
  })
}
