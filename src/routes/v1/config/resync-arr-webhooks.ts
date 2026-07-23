import {
  ErrorSchema,
  WebhookResyncResponseSchema,
} from '@root/schemas/config/resync-arr-webhooks.schema.js'
import { logRouteError, stripArrApiErrorPrefix } from '@utils/route-errors.js'
import type { FastifyPluginAsyncZodOpenApi } from 'fastify-zod-openapi'

const plugin: FastifyPluginAsyncZodOpenApi = async (fastify) => {
  fastify.post(
    '/resync-arr-webhooks',
    {
      schema: {
        summary: 'Resync arr webhooks',
        operationId: 'resyncArrWebhooks',
        description:
          'Re-register Pulsarr webhooks in all configured Radarr and Sonarr instances using the current network settings',
        response: {
          200: WebhookResyncResponseSchema,
          500: ErrorSchema,
        },
        tags: ['Config'],
      },
    },
    async (request, reply) => {
      try {
        const [radarr, sonarr] = await Promise.all([
          fastify.radarrManager.resyncWebhooks(),
          fastify.sonarrManager.resyncWebhooks(),
        ])

        return {
          success: [...radarr, ...sonarr].every((result) => result.success),
          radarr: radarr.map((result) => ({
            ...result,
            message: stripArrApiErrorPrefix('radarr', result.message),
          })),
          sonarr: sonarr.map((result) => ({
            ...result,
            message: stripArrApiErrorPrefix('sonarr', result.message),
          })),
        }
      } catch (error) {
        logRouteError(fastify.log, request, error, {
          message: 'Error resyncing arr webhooks',
        })
        return reply.internalServerError('Unable to resync arr webhooks')
      }
    },
  )
}

export default plugin
