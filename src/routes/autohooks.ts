import { getAuthBypassStatus } from '@utils/auth-bypass.js'
import { normalizeBasePath } from '@utils/url.js'
import type { FastifyInstance } from 'fastify'

export default async function (fastify: FastifyInstance) {
  const publicPaths = [
    '/v1/users/login',
    '/v1/users/create-admin',
    '/v1/notifications/webhook',
  ]

  // Compute full public paths with basePath prefix at startup
  const basePath = normalizeBasePath(fastify.config.basePath)
  const fullPublicPaths = publicPaths.map((path) =>
    basePath === '/' ? path : `${basePath}${path}`,
  )

  fastify.addHook('onRequest', async (request, reply) => {
    // Skip authentication for public paths
    const urlWithoutQuery = request.url.split('?')[0]
    const isPublicPath = fullPublicPaths.some(
      (fullPath) =>
        urlWithoutQuery === fullPath ||
        urlWithoutQuery.startsWith(`${fullPath}/`),
    )

    if (isPublicPath) {
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
