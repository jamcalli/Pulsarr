import type { FastifyPluginAsync } from 'fastify'
import type { z } from 'zod'
import {
  SyncNotifiersResponseSchema,
  ErrorSchema,
  type SyncNotifiersResponse,
} from '@root/schemas/tautulli/tautulli.schema.js'
import { logRouteError } from '@utils/route-errors.js'

const plugin: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Reply: SyncNotifiersResponse
  }>(
    '/sync-notifiers',
    {
      schema: {
        summary: 'Sync user notifiers',
        operationId: 'syncTautulliNotifiers',
        description:
          'Sync Pulsarr users with Tautulli notification agents. Requires Plex Pass.',
        response: {
          200: SyncNotifiersResponseSchema,
          400: ErrorSchema,
          500: ErrorSchema,
        },
        tags: ['Tautulli'],
      },
    },
    async (request, reply) => {
      try {
        // Check if user has Plex Pass by verifying RSS feeds exist
        const config = fastify.config
        if (!config?.selfRss || !config?.friendsRss) {
          return reply.badRequest(
            'Plex Pass is required for Tautulli integration. Please generate RSS feeds first to verify Plex Pass subscription.',
          )
        }

        await fastify.tautulli.syncUserNotifiers()

        // Get users with Tautulli enabled to count them
        const allUsers = await fastify.db.getAllUsers()
        const tautulliUsers = allUsers.filter(
          (user) => user.notify_tautulli && user.can_sync,
        )

        return {
          success: true,
          message: 'User notifiers synced successfully',
          eligibleUsers: tautulliUsers.length,
        }
      } catch (error) {
        logRouteError(fastify.log, request, error, {
          message: 'Failed to sync user notifiers',
        })
        return reply.internalServerError('Failed to sync notifiers')
      }
    },
  )
}

export default plugin
