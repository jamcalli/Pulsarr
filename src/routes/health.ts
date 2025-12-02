import {
  type HealthCheckResponse,
  HealthCheckResponseSchema,
} from '@schemas/health/health.schema.js'
import type { FastifyPluginAsync } from 'fastify'

const plugin: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Reply: HealthCheckResponse
  }>(
    '/health',
    {
      schema: {
        summary: 'Health check endpoint',
        operationId: 'getHealth',
        description:
          'Returns the health status of the application. Used by Docker HEALTHCHECK and orchestrators. Does not require authentication.',
        response: {
          200: HealthCheckResponseSchema,
          503: HealthCheckResponseSchema,
        },
        tags: ['System'],
      },
    },
    async (_request, reply) => {
      const timestamp = new Date().toISOString()
      let dbStatus: 'ok' | 'failed' = 'ok'

      try {
        // Test database connectivity with a simple query
        await fastify.db.knex.raw('SELECT 1')
      } catch (error) {
        fastify.log.error(
          { error },
          'Health check failed: database connectivity error',
        )
        dbStatus = 'failed'
      }

      const isHealthy = dbStatus === 'ok'
      const statusCode = isHealthy ? 200 : 503

      return reply.status(statusCode).send({
        status: isHealthy ? 'healthy' : 'unhealthy',
        timestamp,
        checks: {
          database: dbStatus,
        },
      })
    },
  )
}

export default plugin
