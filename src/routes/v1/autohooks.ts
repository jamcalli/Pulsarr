import { getAuthBypassStatus } from '@utils/auth-bypass.js'
import { assignTemporaryAdminUser } from '@utils/temporary-admin.js'
import type { FastifyInstance } from 'fastify'

declare module 'fastify' {
  interface FastifyContextConfig {
    /** Skips the session and API key check, so the route must authenticate the caller itself. */
    public?: boolean
  }
}

export default async function (fastify: FastifyInstance) {
  // A 401 from this hook never reaches route-level limiters, so failed auth is counted here
  const globalLimiter = fastify.rateLimit()

  fastify.addHook('onRequest', async (request, reply) => {
    if (request.routeOptions.config.public) {
      return
    }

    // A presented key is always validated, so a revoked key fails instead of falling back to bypass
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
        const statusCode = (error as Error & { statusCode?: number }).statusCode
        if (statusCode !== 401) {
          throw error
        }
        await globalLimiter.call(fastify, request, reply)
        return reply.unauthorized('Invalid API key')
      }
    }

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
      if (!request.user) {
        assignTemporaryAdminUser(request, await fastify.db.getAdminUser())
      }
      return
    }

    if (!request.user) {
      await globalLimiter.call(fastify, request, reply)
      return reply.unauthorized(
        'You must be authenticated to access this route.',
      )
    }
  })
}
