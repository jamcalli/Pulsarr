import type { FastifyError, FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'

/**
 * Global error handler plugin.
 * Provides consistent error responses and appropriate logging.
 */
async function errorHandler(fastify: FastifyInstance) {
  fastify.setErrorHandler((err: FastifyError, request, reply) => {
    const sc = err.statusCode
    // Only a well-formed 4xx is safe to pass through - anything else could leak internals
    const isClientError =
      typeof sc === 'number' &&
      Number.isInteger(sc) &&
      sc >= 400 &&
      sc < 500 &&
      typeof err.message === 'string' &&
      err.message.length > 0

    // Avoid logging query/params to prevent leaking tokens/PII
    const logData = {
      err,
      request: {
        id: request.id,
        method: request.method,
        path: request.url.split('?')[0],
        route: request.routeOptions?.url,
        ip: request.ip,
      },
    }

    // Use appropriate log level based on status code
    if (isClientError && sc === 401) {
      request.log.warn(logData, 'Authentication required')
    } else if (isClientError) {
      request.log.warn(logData, 'Client error occurred')
    } else {
      request.log.error(logData, 'Internal server error occurred')
    }

    return isClientError ? reply.send(err) : reply.internalServerError()
  })
}

export default fp(errorHandler, {
  name: 'error-handler',
  dependencies: ['@fastify/sensible'],
})
