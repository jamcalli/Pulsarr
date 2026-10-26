import { plexConfigNotificationSchema } from '@schemas/plex/configure-notifications.schema.js'
import { logRouteError } from '@utils/route-errors.js'
import type { FastifyPluginAsyncZodOpenApi } from 'fastify-zod-openapi'

const plugin: FastifyPluginAsyncZodOpenApi = async (fastify, _opts) => {
  fastify.route({
    method: 'POST',
    url: '/configure-notifications',
    schema: plexConfigNotificationSchema,
    handler: async (request, reply) => {
      try {
        const outcome =
          await fastify.plexServerService.configureArrPlexNotifications(
            request.body,
          )
        if (outcome.kind === 'no-token') {
          return reply.badRequest('Link a Plex account first')
        }
        if (outcome.kind === 'no-instances') {
          return reply.badRequest('No Radarr or Sonarr instances configured')
        }
        const { run } = outcome

        return {
          success: run.successCount > 0,
          message: `Configured Plex notifications for ${run.successCount} of ${run.instanceCount} instances (${run.radarrSuccessCount} Radarr, ${run.sonarrSuccessCount} Sonarr)`,
          results: run.results,
        }
      } catch (error) {
        logRouteError(fastify.log, request, error, {
          message: 'Failed to configure Plex notifications',
        })
        return reply.internalServerError(
          'Unable to configure Plex notifications',
        )
      }
    },
  })
}

export default plugin
