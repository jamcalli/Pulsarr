import type { ErrorResponse } from '@root/schemas/common/error.schema.js'
import type { FastifyError, FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'

/**
 * Global error handler plugin.
 * Provides consistent error responses and appropriate logging.
 */
async function errorHandler(fastify: FastifyInstance) {
  fastify.setErrorHandler((err: FastifyError, request, reply) => {
    const statusCode = err.statusCode ?? 500
    // Avoid logging query/params to prevent leaking tokens/PII
    const logData = {
      err,
      request: {
        id: request.id,
        method: request.method,
        path: request.url.split('?')[0],
        route: request.routeOptions?.url,
      },
    }

    // Use appropriate log level based on status code
    if (statusCode === 401) {
      request.log.warn(logData, 'Authentication required')
    } else if (statusCode >= 500) {
      request.log.error(logData, 'Internal server error occurred')
    } else {
      request.log.warn(logData, 'Client error occurred')
    }
    reply.code(statusCode)
    const isServerError = statusCode >= 500
    const payload: ErrorResponse = {
      statusCode,
      code: err.code || 'GENERIC_ERROR',
      error: isServerError
        ? 'Internal Server Error'
        : 'error' in err && typeof err.error === 'string'
          ? err.error
          : 'Client Error',
      message: isServerError
        ? 'Internal Server Error'
        : err.message || 'An error occurred',
    }
    return payload
  })
}

export default fp(errorHandler, {
  name: 'error-handler',
})
