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
        const outcome =
          await fastify.plexServerService.removeArrPlexNotifications()
        if (outcome.kind === 'no-instances') {
          return reply.badRequest('No Radarr or Sonarr instances configured')
        }
        const { run } = outcome

        return {
          success: run.successCount > 0,
          message: `Removed Plex notifications from ${run.successCount} of ${run.instanceCount} instances (${run.radarrSuccessCount} Radarr, ${run.sonarrSuccessCount} Sonarr)`,
          results: run.results,
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
