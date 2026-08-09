import { PROBE_RATE_LIMIT } from '@root/plugins/external/rate-limit.js'
import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'

/**
 * 404 Not Found handler plugin with rate limiting.
 * Prevents abuse from repeated requests to non-existent routes.
 */
async function notFoundHandler(fastify: FastifyInstance) {
  fastify.setNotFoundHandler(
    {
      preHandler: fastify.rateLimit(PROBE_RATE_LIMIT),
    },
    (_request, reply) => reply.notFound('Resource not found'),
  )
}

export default fp(notFoundHandler, {
  name: 'not-found',
  dependencies: ['@fastify/rate-limit', '@fastify/sensible'],
})
