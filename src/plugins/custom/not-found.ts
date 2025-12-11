import type { ErrorResponse } from '@root/schemas/common/error.schema.js'
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
        max: 3,
        timeWindow: 500,
      }),
    },
    (request, reply) => {
      request.log.warn(
        {
          request: {
            id: request.id,
            method: request.method,
            path: request.url.split('?')[0],
            route: request.routeOptions?.url,
          },
        },
        'Resource not found',
      )
      reply.code(404)
      const response: ErrorResponse = {
        statusCode: 404,
        code: 'NOT_FOUND',
        error: 'Not Found',
        message: 'Resource not found',
      }
      return response
    },
  )
}

export default fp(notFoundHandler, {
  name: 'not-found',
  dependencies: ['@fastify/rate-limit'],
})
