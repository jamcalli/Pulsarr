import { STATUS_CODES } from 'node:http'
import type { ErrorResponse } from '@root/schemas/common/error.schema.js'
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

    const payload: ErrorResponse = isClientError
      ? {
          statusCode: sc,
          error: STATUS_CODES[sc] ?? 'Error',
          message: err.message,
        }
      : {
          statusCode: 500,
          error: 'Internal Server Error',
          message: 'Internal Server Error',
        }

    reply.code(payload.statusCode)
    return payload
  })
}

export default fp(errorHandler, {
  name: 'error-handler',
})
