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

  const checkPublicRoute = fastify.auth([fastify.checkRequestOrigin])
  // A presented key is always validated, so a revoked key fails instead of falling back to local access
  const checkProtectedRoute = fastify.auth(
    [
      fastify.checkRequestOrigin,
      fastify.rejectInvalidApiKey,
      [fastify.verifyApiKey, fastify.verifySession, fastify.verifyLocalAccess],
    ],
    { relation: 'and' },
  )

  fastify.addHook('onRequest', async (request, reply) => {
    const authenticate = request.routeOptions.config.public
      ? checkPublicRoute
      : checkProtectedRoute
    try {
      await new Promise<void>((resolve, reject) => {
        authenticate.call(fastify, request, reply, (error) =>
          error ? reject(error) : resolve(),
        )
      })
    } catch (error) {
      await globalLimiter.call(fastify, request, reply)
      throw error
    }
  })
}
