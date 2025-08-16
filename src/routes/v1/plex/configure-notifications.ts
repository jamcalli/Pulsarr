import { plexConfigNotificationSchema } from '@schemas/plex/configure-notifications.schema.js'
import { logRouteError } from '@utils/route-errors.js'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

export const configureNotificationsRoute: FastifyPluginAsyncZod = async (
  fastify,
  _opts,
) => {
  fastify.route({
    method: 'POST',
    url: '/configure-notifications',
    schema: plexConfigNotificationSchema,
    handler: async (request, reply) => {
      try {
        const { plexToken, plexHost, plexPort, useSsl } = request.body

        if (!plexToken || !plexHost) {
          return reply.badRequest('Plex token and host are required')
        }

        // Get all Radarr instances
        const radarrInstances = await fastify.radarrManager.getAllInstances()
        // Get all Sonarr instances
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

        // Process each Radarr instance with timeout
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

            // Configure Plex notification with timeout (ensure timer is cleared to avoid unhandled rejections)
            let timeoutId: NodeJS.Timeout
            const timeoutPromise = new Promise<never>((_, reject) => {
              timeoutId = setTimeout(() => {
                reject(
                  new Error(
                    'Timeout configuring Plex notification for Radarr instance',
                  ),
                )
              }, 5000) // 5 second timeout
            })

            const configurePromise = radarrService.configurePlexNotification(
              plexToken,
              plexHost,
              plexPort,
              useSsl,
            )

            // Race the configuration against the timeout
            await Promise.race([
              // Clear timeout if configurePromise settles first
              configurePromise.finally(() => clearTimeout(timeoutId)),
              timeoutPromise,
            ])

            results.radarr.push({
              id: instance.id,
              name: instance.name,
              success: true,
              message: 'Plex notification configured successfully',
            })
          } catch (error) {
            logRouteError(fastify.log, request, error, {
              message: 'Failed to configure Plex notification for Radarr',
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

        // Process each Sonarr instance with timeout
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

            // Configure Plex notification with timeout (ensure timer is cleared to avoid unhandled rejections)
            let timeoutId: NodeJS.Timeout
            const timeoutPromise = new Promise<never>((_, reject) => {
              timeoutId = setTimeout(() => {
                reject(
                  new Error(
                    'Timeout configuring Plex notification for Sonarr instance',
                  ),
                )
              }, 5000) // 5 second timeout
            })

            const configurePromise = sonarrService.configurePlexNotification(
              plexToken,
              plexHost,
              plexPort,
              useSsl,
            )

            // Race the configuration against the timeout
            await Promise.race([
              // Clear timeout if configurePromise settles first
              configurePromise.finally(() => clearTimeout(timeoutId)),
              timeoutPromise,
            ])

            results.sonarr.push({
              id: instance.id,
              name: instance.name,
              success: true,
              message: 'Plex notification configured successfully',
            })
          } catch (error) {
            logRouteError(fastify.log, request, error, {
              message: 'Failed to configure Plex notification for Sonarr',
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
          message: `Configured Plex notifications for ${totalSuccessCount} of ${totalInstanceCount} instances (${radarrSuccessCount} Radarr, ${sonarrSuccessCount} Sonarr)`,
          results,
        }
      } catch (err) {
        logRouteError(fastify.log, request, err, {
          message: 'Failed to configure Plex notifications',
        })
        return reply.internalServerError(
          'Unable to configure Plex notifications',
        )
      }
    },
  })
}
