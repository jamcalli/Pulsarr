import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { ErrorSchema } from '@schemas/stats/stats.schema.js'

// Define schemas for responses
const SyncInstanceResultSchema = z.object({
  itemsCopied: z.number(),
  message: z.string(),
})

const SyncAllInstancesResultSchema = z.object({
  shows: z.number(),
  movies: z.number(),
  message: z.string(),
})

const InstanceIdParamsSchema = z.object({
  instanceId: z.coerce.number().int().positive(),
})

const InstanceTypeQuerySchema = z.object({
  type: z.enum(['radarr', 'sonarr']),
})

const plugin: FastifyPluginAsync = async (fastify) => {
  // Sync a new instance (radarr or sonarr)
  fastify.post<{
    Params: z.infer<typeof InstanceIdParamsSchema>
    Querystring: z.infer<typeof InstanceTypeQuerySchema>
    Reply: z.infer<typeof SyncInstanceResultSchema>
  }>(
    '/instance/:instanceId',
    {
      schema: {
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

        // Check if instance exists before attempting to sync
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
        fastify.log.error(`Error syncing instance: ${err}`)
        return reply.internalServerError('Unable to sync instance')
      }
    },
  )

  // Sync new Radarr instance
  fastify.post<{
    Params: z.infer<typeof InstanceIdParamsSchema>
    Reply: z.infer<typeof SyncInstanceResultSchema>
  }>(
    '/radarr/:instanceId',
    {
      schema: {
        params: InstanceIdParamsSchema,
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

        fastify.log.info(`Starting sync for Radarr instance ${instanceId}`)

        const instance = await fastify.db.getRadarrInstance(instanceId)
        if (!instance) {
          return reply.notFound(
            `Radarr instance with ID ${instanceId} not found`,
          )
        }

        const itemsCopied = await fastify.sync.syncRadarrInstance(instanceId)

        fastify.log.info(
          `Radarr instance sync completed: Copied ${itemsCopied} movies`,
        )

        return {
          itemsCopied,
          message: `Successfully synchronized ${itemsCopied} movies to Radarr instance`,
        }
      } catch (err) {
        fastify.log.error(`Error syncing Radarr instance: ${err}`)
        return reply.internalServerError('Unable to sync Radarr instance')
      }
    },
  )

  // Sync new Sonarr instance
  fastify.post<{
    Params: z.infer<typeof InstanceIdParamsSchema>
    Reply: z.infer<typeof SyncInstanceResultSchema>
  }>(
    '/sonarr/:instanceId',
    {
      schema: {
        params: InstanceIdParamsSchema,
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

        fastify.log.info(`Starting sync for Sonarr instance ${instanceId}`)

        const instance = await fastify.db.getSonarrInstance(instanceId)
        if (!instance) {
          return reply.notFound(
            `Sonarr instance with ID ${instanceId} not found`,
          )
        }

        const itemsCopied = await fastify.sync.syncSonarrInstance(instanceId)

        fastify.log.info(
          `Sonarr instance sync completed: Copied ${itemsCopied} shows`,
        )

        return {
          itemsCopied,
          message: `Successfully synchronized ${itemsCopied} shows`,
        }
      } catch (err) {
        fastify.log.error(`Error syncing Radarr instance: ${err}`)
        return reply.internalServerError('Unable to sync Sonarr instance')
      }
    },
  )

  // Combined sync for both Radarr and Sonarr
  fastify.post<{
    Params: z.infer<typeof InstanceIdParamsSchema>
    Reply: z.infer<typeof SyncAllInstancesResultSchema>
  }>(
    '/all/:instanceId',
    {
      schema: {
        params: InstanceIdParamsSchema,
        response: {
          200: SyncAllInstancesResultSchema,
          500: ErrorSchema,
        },
        tags: ['Sync'],
      },
    },
    async (request, reply) => {
      try {
        const { instanceId } = request.params

        fastify.log.info(`Starting combined sync for instance ${instanceId}`)

        // Check if the instance exists in both Radarr and Sonarr
        const radarrInstance = await fastify.db.getRadarrInstance(instanceId)
        const sonarrInstance = await fastify.db.getSonarrInstance(instanceId)

        if (!radarrInstance && !sonarrInstance) {
          return reply.notFound(
            `No instance with ID ${instanceId} found in either Radarr or Sonarr`,
          )
        }

        let movies = 0
        let shows = 0

        // Sync Radarr if the instance exists
        if (radarrInstance) {
          movies = await fastify.sync.syncRadarrInstance(instanceId)
          fastify.log.info(`Radarr sync completed: Copied ${movies} movies`)
        }

        // Sync Sonarr if the instance exists
        if (sonarrInstance) {
          shows = await fastify.sync.syncSonarrInstance(instanceId)
          fastify.log.info(`Sonarr sync completed: Copied ${shows} shows`)
        }

        return {
          shows,
          movies,
          message: `Successfully synchronized ${shows} shows and ${movies} movies to instance`,
        }
      } catch (err) {
        fastify.log.error(`Error performing combined sync for instance: ${err}`)
        return reply.internalServerError(
          'Unable to perform combined sync for instance',
        )
      }
    },
  )
}

export default plugin
