import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'

/**
 * 404 Not Found handler plugin with rate limiting.
 * Prevents abuse from repeated requests to non-existent routes.
 */
async function notFoundHandler(fastify: FastifyInstance) {
  fastify.setNotFoundHandler(
    {
      preHandler: fastify.rateLimit({
        max: 10,
        timeWindow: '1 minute',
      }),
    },
    (_request, reply) => reply.notFound('Resource not found'),
  )
}

export default fp(notFoundHandler, {
  name: 'not-found',
  dependencies: ['@fastify/rate-limit', '@fastify/sensible'],
})
