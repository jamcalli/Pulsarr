/**
 * GET /v1/system/update-status
 *
 * Returns the cached "Pulsarr update available" status maintained by the
 * `update-check` plugin. Cheap read-only call - the GitHub fetch happens
 * server-side on an hourly cron, not on this request.
 */

import {
  UpdateStatusErrorSchema,
  UpdateStatusResponseSchema,
} from '@schemas/system/update-status.schema.js'
import { logRouteError } from '@utils/route-errors.js'
import type { FastifyPluginAsyncZodOpenApi } from 'fastify-zod-openapi'

const plugin: FastifyPluginAsyncZodOpenApi = async (fastify) => {
  fastify.get(
    '/update-status',
    {
      schema: {
        summary: 'Get cached Pulsarr update status',
        operationId: 'getUpdateStatus',
        description:
          'Returns the most recent cached Pulsarr release check from the update-check service. The actual GitHub fetch happens server-side on an hourly cron.',
        response: {
          200: UpdateStatusResponseSchema,
          500: UpdateStatusErrorSchema,
        },
        tags: ['System'],
      },
    },
    async (request, reply) => {
      try {
        return fastify.updateCheck.getStatus()
      } catch (error) {
        logRouteError(fastify.log, request, error, {
          message: 'Failed to read cached update status',
        })
        return reply.internalServerError('Unable to read cached update status')
      }
    },
  )
}

export default plugin
