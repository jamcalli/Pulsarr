import { getAuthBypassStatus } from '@utils/auth-bypass.js'
import type { FastifyInstance } from 'fastify'

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

    // Check for API key authentication first (no bypass for API keys)
    const apiKey = request.headers['x-api-key'] as string
    if (apiKey) {
      try {
        await new Promise<void>((resolve, reject) => {
          fastify.verifyApiKey(request, reply, (err) => {
            if (err) reject(err)
            else resolve()
          })
        })
        // Valid API key, allow access
        return
      } catch (_err) {
        // Invalid API key
        return reply.unauthorized('Invalid API key')
      }
    }

    // Check if session auth should be bypassed based on config and IP
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

    // Regular session authentication check for all other cases
    if (!request.session.user) {
      return reply.unauthorized(
        'You must be authenticated to access this route.',
      )
    }
  })
}
