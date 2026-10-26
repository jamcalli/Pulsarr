import { plexGetNotificationStatusSchema } from '@schemas/plex/get-notification-status.schema.js'
import { logRouteError } from '@utils/route-errors.js'
import type { FastifyPluginAsyncZodOpenApi } from 'fastify-zod-openapi'

const plugin: FastifyPluginAsyncZodOpenApi = async (fastify, _opts) => {
  fastify.route({
    method: 'GET',
    url: '/notification-status',
    schema: plexGetNotificationStatusSchema,
    handler: async (request, reply) => {
      try {
        const outcome =
          await fastify.plexServerService.getArrPlexNotificationStatus()
        if (outcome.kind === 'no-instances') {
          return reply.badRequest('No Radarr or Sonarr instances configured')
        }
        const { run } = outcome

        return {
          success: run.successCount > 0,
          message: `${run.successCount} of ${run.instanceCount} instances have Plex notifications configured (${run.radarrSuccessCount} Radarr, ${run.sonarrSuccessCount} Sonarr)`,
          results: run.results,
        }
      } catch (error) {
        logRouteError(fastify.log, request, error, {
          message: 'Failed to check Plex notification status',
        })
        return reply.internalServerError(
          'Unable to check Plex notification status',
        )
      }
    },
  })
}

export default plugin
