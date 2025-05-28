import type { FastifyPluginAsync } from 'fastify'

const plugin: FastifyPluginAsync = async (fastify) => {
  // Test Tautulli connection
  fastify.post(
    '/test',
    {
      schema: {
        summary: 'Test Tautulli connection',
        operationId: 'testTautulliConnection',
        description:
          'Test the connection to Tautulli using the current configuration',
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              message: { type: 'string' },
            },
          },
        },
        tags: ['Tautulli'],
      },
    },
    async () => {
      try {
        // Test by calling arnold endpoint (Tautulli's test endpoint)
        const isConnected = await fastify.tautulli.testConnection()

        if (isConnected) {
          return {
            success: true,
            message: 'Successfully connected to Tautulli',
          }
        }
        return { success: false, message: 'Failed to connect to Tautulli' }
      } catch (error) {
        fastify.log.error(error, 'Failed to test Tautulli connection')
        return { success: false, message: 'Connection test failed' }
      }
    },
  )

  // Sync user notifiers
  fastify.post(
    '/sync-notifiers',
    {
      schema: {
        summary: 'Sync user notifiers',
        operationId: 'syncTautulliNotifiers',
        description: 'Sync Pulsarr users with Tautulli notification agents',
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              message: { type: 'string' },
              syncedUsers: { type: 'number' },
            },
          },
        },
        tags: ['Tautulli'],
      },
    },
    async (_, reply) => {
      try {
        await fastify.tautulli.syncUserNotifiers()

        // Get users with Tautulli enabled to count them
        const allUsers = await fastify.db.getAllUsers()
        const tautulliUsers = allUsers.filter(
          (user) => user.notify_tautulli && user.can_sync,
        )

        return {
          success: true,
          message: 'User notifiers synced successfully',
          syncedUsers: tautulliUsers.length,
        }
      } catch (error) {
        fastify.log.error(error, 'Failed to sync user notifiers')
        return reply.internalServerError('Failed to sync notifiers')
      }
    },
  )
}

export default plugin
