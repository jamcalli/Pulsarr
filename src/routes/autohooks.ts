import type { FastifyInstance } from 'fastify'
import { isLocalIpAddress } from '@utils/ip.js'

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

    // Check authentication method from configuration
    const authMethod = fastify.config.authenticationMethod

    // Completely disabled authentication
    if (authMethod === 'disabled') {
      fastify.log.debug(
        { url: request.url },
        'Authentication disabled globally',
      )
      return
    }

    // Disabled for local addresses
    if (authMethod === 'requiredExceptLocal') {
      const clientIp = request.ip
      if (isLocalIpAddress(clientIp)) {
        // Local address with auth bypass enabled - skip authentication check
        fastify.log.debug(
          { ip: clientIp, url: request.url },
          'Bypassing authentication for local address',
        )
        return
      }
    }

    // Regular authentication check for all other cases
    if (!request.session.user) {
      reply.unauthorized('You must be authenticated to access this route.')
    }
  })
}
