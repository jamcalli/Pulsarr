import { plexRemoveNotificationSchema } from '@schemas/plex/remove-notifications.schema.js'
import { logRouteError } from '@utils/route-errors.js'
import type { FastifyPluginAsyncZodOpenApi } from 'fastify-zod-openapi'

const plugin: FastifyPluginAsyncZodOpenApi = async (fastify, _opts) => {
  fastify.route({
    method: 'DELETE',
    url: '/remove-notifications',
    schema: plexRemoveNotificationSchema,
    handler: async (request, reply) => {
      try {
        const radarrInstances = await fastify.radarrManager.getAllInstances()
        const sonarrInstances = await fastify.sonarrManager.getAllInstances()

        if (radarrInstances.length === 0 && sonarrInstances.length === 0) {
          return reply.badRequest('No Radarr or Sonarr instances configured')
        }

        const results = {
          radarr: [] as Array<{
            id: number
            name: string
            success: boolean
            message: string
          }>,
          sonarr: [] as Array<{
            id: number
            name: string
            success: boolean
            message: string
          }>,
        }

        for (const instance of radarrInstances) {
          try {
            const radarrService = fastify.radarrManager.getRadarrService(
              instance.id,
            )

            if (!radarrService) {
              results.radarr.push({
                id: instance.id,
                name: instance.name,
                success: false,
                message: 'Radarr service not initialized',
              })
              continue
            }

            await radarrService.removePlexNotification()

            results.radarr.push({
              id: instance.id,
              name: instance.name,
              success: true,
              message: 'Plex notification removed successfully',
            })
          } catch (error) {
            logRouteError(fastify.log, request, error, {
              message: 'Failed to remove Plex notification from Radarr',
              context: { instanceId: instance.id, instanceName: instance.name },
            })
            results.radarr.push({
              id: instance.id,
              name: instance.name,
              success: false,
              message: error instanceof Error ? error.message : 'Unknown error',
            })
          }
        }

        for (const instance of sonarrInstances) {
          try {
            const sonarrService = fastify.sonarrManager.getSonarrService(
              instance.id,
            )

            if (!sonarrService) {
              results.sonarr.push({
                id: instance.id,
                name: instance.name,
                success: false,
                message: 'Sonarr service not initialized',
              })
              continue
            }

            await sonarrService.removePlexNotification()

            results.sonarr.push({
              id: instance.id,
              name: instance.name,
              success: true,
              message: 'Plex notification removed successfully',
            })
          } catch (error) {
            logRouteError(fastify.log, request, error, {
              message: 'Failed to remove Plex notification from Sonarr',
              context: { instanceId: instance.id, instanceName: instance.name },
            })
            results.sonarr.push({
              id: instance.id,
              name: instance.name,
              success: false,
              message: error instanceof Error ? error.message : 'Unknown error',
            })
          }
        }

        const radarrSuccessCount = results.radarr.filter(
          (r) => r.success,
        ).length
        const sonarrSuccessCount = results.sonarr.filter(
          (r) => r.success,
        ).length
        const totalSuccessCount = radarrSuccessCount + sonarrSuccessCount
        const totalInstanceCount =
          radarrInstances.length + sonarrInstances.length

        return {
          success: totalSuccessCount > 0,
          message: `Removed Plex notifications from ${totalSuccessCount} of ${totalInstanceCount} instances (${radarrSuccessCount} Radarr, ${sonarrSuccessCount} Sonarr)`,
          results,
        }
      } catch (error) {
        logRouteError(fastify.log, request, error, {
          message: 'Failed to remove Plex notifications',
        })
        return reply.internalServerError('Unable to remove Plex notifications')
      }
    },
  })
}

export default plugin
