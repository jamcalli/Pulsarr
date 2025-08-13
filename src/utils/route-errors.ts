import type { FastifyBaseLogger, FastifyReply, FastifyRequest } from 'fastify'

interface RouteErrorContext {
  /** The error that occurred */
  error: unknown
  /** HTTP method and path (e.g., 'GET /radarr/tags') */
  route?: string
  /** Instance ID for service routes (Radarr/Sonarr) */
  instanceId?: string | number
  /** User ID if authenticated */
  userId?: string | number
  /** Additional context fields */
  [key: string]: unknown
}

interface LogRouteErrorOptions {
  /** Custom log message (defaults to generic error message based on route) */
  message?: string
  /** Additional context to include in logs */
  context?: Record<string, unknown>
  /** Log level; defaults to 'error' */
  level?: 'error' | 'warn' | 'info'
  /** Allow any additional context fields directly on the options object for backward compatibility */
  [key: string]: unknown
}

/**
 * Standardized error logging helper for route handlers
 *
 * @param logger - Fastify logger instance
 * @param request - Fastify request object
 * @param error - The error that occurred
 * @param options - Optional message and additional context
 *
 * @example
 * ```typescript
 * // Basic usage
 * logRouteError(fastify.log, request, err)
 *
 * // With custom message
 * logRouteError(fastify.log, request, err, {
 *   message: 'Failed to create Radarr tag'
 * })
 *
 * // With additional context
 * logRouteError(fastify.log, request, err, {
 *   context: { instanceId: params.instanceId, tagName: body.label }
 * })
 * ```
 */
export function logRouteError(
  logger: FastifyBaseLogger,
  request: FastifyRequest,
  error: unknown,
  options: LogRouteErrorOptions = {},
): void {
  const route = `${request.method} ${request.routeOptions?.url || request.url}`

  // Extract common context from request
  const baseContext: RouteErrorContext = {
    error,
    route,
  }

  // Add user ID if authenticated
  if ('user' in request && request.user && typeof request.user === 'object') {
    const user = request.user as { id?: string | number }
    if (user.id) {
      baseContext.userId = user.id
    }
  }

  // Add any additional context provided
  if (options.context) {
    Object.assign(baseContext, options.context)
  }

  // Also add any context fields passed directly on options object
  const { message: _message, context: _context, ...directContext } = options
  Object.assign(baseContext, directContext)

  // Generate default message if not provided
  const message = options.message || `Error in route ${route}`

  const level = options.level ?? 'error'
  switch (level) {
    case 'warn':
      logger.warn(baseContext, message)
      break
    case 'info':
      logger.info(baseContext, message)
      break
    default:
      logger.error(baseContext, message)
  }
}

/**
 * Helper for service instance routes (Radarr/Sonarr)
 * Automatically extracts instanceId from route params
 *
 * @example
 * ```typescript
 * logServiceError(fastify.log, request, err, 'radarr', 'Failed to fetch tags')
 * ```
 */
export function logServiceError(
  logger: FastifyBaseLogger,
  request: FastifyRequest,
  error: unknown,
  serviceName: 'radarr' | 'sonarr' | 'tautulli',
  message?: string,
): void {
  const params = request.params as { instanceId?: string }
  const query = request.query as { instanceId?: string }
  const instanceId = params?.instanceId ?? query?.instanceId

  logRouteError(logger, request, error, {
    message: message || `Error in ${serviceName} service operation`,
    context: {
      instanceId,
      service: serviceName,
    },
  })
}

/**
 * Quick helper for common internal server errors
 * Logs the error and sends a 500 response
 */
export function handleRouteError(
  logger: FastifyBaseLogger,
  request: FastifyRequest,
  reply: FastifyReply,
  error: unknown,
  publicMessage: string,
  logMessage?: string,
): void {
  logRouteError(logger, request, error, { message: logMessage })

  reply.status(500).send({
    success: false,
    message: publicMessage,
  })
}
