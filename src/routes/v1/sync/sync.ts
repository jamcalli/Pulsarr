import {
  ErrorSchema,
  InstanceIdParamsSchema,
  InstanceTypeQuerySchema,
  SyncAllInstancesResultSchema,
  SyncInstanceResultSchema,
} from '@schemas/sync/sync.schema.js'
import { logRouteError } from '@utils/route-errors.js'
import type { FastifyPluginAsync } from 'fastify'
import type { z } from 'zod'

const plugin: FastifyPluginAsync = async (fastify) => {
  // Sync a specific instance (radarr or sonarr)
  fastify.post<{
    Params: z.infer<typeof InstanceIdParamsSchema>
    Querystring: z.infer<typeof InstanceTypeQuerySchema>
    Reply: z.infer<typeof SyncInstanceResultSchema>
  }>(
    '/instance/:instanceId',
    {
      schema: {
        summary: 'Sync specific instance',
        operationId: 'syncInstance',
        description:
          'Synchronize watchlist items to a specific Radarr or Sonarr instance',
        params: InstanceIdParamsSchema,
        querystring: InstanceTypeQuerySchema,
        response: {
          200: SyncInstanceResultSchema,
          500: ErrorSchema,
        },
        tags: ['Sync'],
      },
    },
    async (request, reply) => {
      try {
        const { instanceId } = request.params
        const { type } = request.query

        fastify.log.info(`Starting sync for ${type} instance ${instanceId}`)

        if (type === 'radarr') {
          const instance = await fastify.db.getRadarrInstance(instanceId)
          if (!instance) {
            return reply.notFound(
              `Radarr instance with ID ${instanceId} not found`,
            )
          }
        } else {
          const instance = await fastify.db.getSonarrInstance(instanceId)
          if (!instance) {
            return reply.notFound(
              `Sonarr instance with ID ${instanceId} not found`,
            )
          }
        }

        const itemsCopied = await fastify.sync.syncInstance(instanceId, type)

        fastify.log.info(
          `${type} instance sync completed: Copied ${itemsCopied} items`,
        )

        return {
          itemsCopied,
          message: `Successfully synchronized ${itemsCopied} items to ${type} instance`,
        }
      } catch (err) {
        logRouteError(fastify.log, request, err, {
          message: 'Failed to sync instance',
          instanceId: request.params.instanceId,
          type: request.query.type,
        })
        return reply.internalServerError('Unable to sync instance')
      }
    },
  )

  // Sync all configured instances (both Radarr and Sonarr)
  fastify.post<{
    Reply: z.infer<typeof SyncAllInstancesResultSchema>
  }>(
    '/all',
    {
      schema: {
        summary: 'Sync all instances',
        operationId: 'syncAllInstances',
        description:
          'Synchronize watchlist items to all configured Radarr and Sonarr instances',
        response: {
          200: SyncAllInstancesResultSchema,
          500: ErrorSchema,
        },
        tags: ['Sync'],
      },
    },
    async (request, reply) => {
      try {
        fastify.log.info('Starting sync for all configured instances')

        const results = await fastify.sync.syncAllConfiguredInstances()

        const totalRadarrItems = results.radarr.reduce(
          (sum, instance) => sum + instance.itemsCopied,
          0,
        )
        const totalSonarrItems = results.sonarr.reduce(
          (sum, instance) => sum + instance.itemsCopied,
          0,
        )

        fastify.log.info(
          `All instances sync completed: Copied ${totalRadarrItems} movies and ${totalSonarrItems} shows across ${results.radarr.length + results.sonarr.length} instances`,
        )

        return {
          ...results,
          message: `Successfully synchronized ${totalRadarrItems} movies and ${totalSonarrItems} shows across all configured instances`,
        }
      } catch (err) {
        logRouteError(fastify.log, request, err, {
          message: 'Failed to sync all instances',
        })
        return reply.internalServerError('Unable to sync all instances')
      }
    },
  )
}

export default plugin
