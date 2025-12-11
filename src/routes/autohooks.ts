import { getAuthBypassStatus } from '@utils/auth-bypass.js'
import { normalizeBasePath } from '@utils/url.js'
import type { FastifyInstance } from 'fastify'

export default async function (fastify: FastifyInstance) {
  // Public API paths that don't require authentication
  const publicApiPaths = [
    '/v1/users/login',
    '/v1/users/create-admin',
    '/v1/notifications/webhook',
  ]

  // Compute full public paths with basePath prefix at startup
  const basePath = normalizeBasePath(fastify.config.basePath)
  const fullPublicApiPaths = publicApiPaths.map((path) =>
    basePath === '/' ? path : `${basePath}${path}`,
  )
  const v1Prefix = basePath === '/' ? '/v1/' : `${basePath}/v1/`

  fastify.log.debug(
    { basePath, fullPublicApiPaths },
    'Computed public API paths for authentication bypass',
  )

  fastify.addHook('onRequest', async (request, reply) => {
    const urlWithoutQuery = request.url.split('?')[0]

    // Skip auth for non-API routes (SPA routes handle their own auth/redirects)
    if (!urlWithoutQuery.startsWith(v1Prefix)) {
      return
    }

    // Skip authentication for public API paths
    const isPublicPath = fullPublicApiPaths.some(
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
