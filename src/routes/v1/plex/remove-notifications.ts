import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { plexRemoveNotificationSchema } from '@schemas/plex/remove-notifications.schema.js'

export const removeNotificationsRoute: FastifyPluginAsyncZod = async (
  fastify,
  _opts,
) => {
  fastify.route({
    method: 'DELETE',
    url: '/remove-notifications',
    schema: plexRemoveNotificationSchema,
    handler: async (request, reply) => {
      try {
        // Get all Radarr instances
        const radarrInstances = await fastify.radarrManager.getAllInstances()
        // Get all Sonarr instances
        const sonarrInstances = await fastify.sonarrManager.getAllInstances()

        if (radarrInstances.length === 0 && sonarrInstances.length === 0) {
          return reply
            .code(400)
            .send({ error: 'No Radarr or Sonarr instances configured' })
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

        // Process each Radarr instance
        for (const instance of radarrInstances) {
          try {
            // Get the RadarrService for this instance
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

            // Remove Plex notification
            await radarrService.removePlexNotification()

            results.radarr.push({
              id: instance.id,
              name: instance.name,
              success: true,
              message: 'Plex notification removed successfully',
            })
          } catch (error) {
            fastify.log.error(
              `Error removing Plex from Radarr instance ${instance.name}:`,
              error,
            )
            results.radarr.push({
              id: instance.id,
              name: instance.name,
              success: false,
              message: error instanceof Error ? error.message : 'Unknown error',
            })
          }
        }

        // Process each Sonarr instance
        for (const instance of sonarrInstances) {
          try {
            // Get the SonarrService for this instance
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

            // Remove Plex notification
            await sonarrService.removePlexNotification()

            results.sonarr.push({
              id: instance.id,
              name: instance.name,
              success: true,
              message: 'Plex notification removed successfully',
            })
          } catch (error) {
            fastify.log.error(
              `Error removing Plex from Sonarr instance ${instance.name}:`,
              error,
            )
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
      } catch (err) {
        fastify.log.error(err)
        return reply
          .code(500)
          .send({ error: 'Unable to remove Plex notifications' })
      }
    },
  })
}
