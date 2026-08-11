import { getAuthBypassStatus } from '@utils/auth-bypass.js'
import { createTemporaryAdminSession } from '@utils/session.js'
import { normalizeBasePath } from '@utils/url.js'
import type { FastifyInstance } from 'fastify'

export default async function (fastify: FastifyInstance) {
  // API paths reachable without auth: login and create-admin bootstrap the
  // admin session; the webhook validates its own shared secret in the route
  const publicApiPaths = [
    '/v1/users/login',
    '/v1/users/create-admin',
    '/v1/notifications/webhook',
  ]

  const basePath = normalizeBasePath(fastify.config.basePath)
  // Exact match only - no public route has subpaths
  const fullPublicApiPaths = new Set(
    publicApiPaths.map((path) =>
      basePath === '/' ? path : `${basePath}${path}`,
    ),
  )
  // v1Prefix without trailing slash so both exact /v1 and /v1/... match below
  const v1Prefix = basePath === '/' ? '/v1' : `${basePath}/v1`

  fastify.log.debug(
    { basePath, publicApiPaths: [...fullPublicApiPaths] },
    'Computed public API paths',
  )

  // No options means the configured global limit and its store. A 401 reply
  // from this hook never reaches route-level limiters, so failed auth has to
  // be counted here or not at all.
  const globalLimiter = fastify.rateLimit()

  fastify.addHook('onRequest', async (request, reply) => {
    const urlWithoutQuery = request.url.split('?')[0]

    // Auth only guards the API; everything else is the SPA shell and assets,
    // where the client redirects unauthenticated users itself. Exact /v1 must
    // match too, or a route mounted at the bare prefix would skip auth.
    const isApiRoute =
      urlWithoutQuery === v1Prefix || urlWithoutQuery.startsWith(`${v1Prefix}/`)
    if (!isApiRoute) {
      return
    }

    if (fullPublicApiPaths.has(urlWithoutQuery)) {
      return
    }

    // Presented credentials are always validated - an invalid key is rejected
    // even when bypass would allow the request, so a revoked key fails loudly
    // instead of silently downgrading to the temp admin identity
    const rawApiKey = request.headers['x-api-key']
    if (rawApiKey && rawApiKey.length > 0) {
      try {
        await new Promise<void>((resolve, reject) => {
          fastify.verifyApiKey(request, reply, (err) => {
            if (err) reject(err)
            else resolve()
          })
        })
        return
      } catch (error) {
        // 401 means bad credentials; anything else (e.g. session plugin
        // failure) is a server error for the error handler
        const statusCode = (error as Error & { statusCode?: number }).statusCode
        if (statusCode !== 401) {
          throw error
        }
        await globalLimiter.call(fastify, request, reply)
        return reply.unauthorized('Invalid API key')
      }
    }

    // Config-based bypass: auth disabled globally, or local IP with
    // requiredExceptLocal. A real logged-in session keeps its own identity;
    // only anonymous requests get the temp admin session.
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
      if (!request.session.user) {
        createTemporaryAdminSession(request)
      }
      return
    }

    // Everything else requires a logged-in session
    if (!request.session.user) {
      await globalLimiter.call(fastify, request, reply)
      return reply.unauthorized(
        'You must be authenticated to access this route.',
      )
    }
  })
}
