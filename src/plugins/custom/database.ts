import fp from 'fastify-plugin'
import type { FastifyInstance } from 'fastify'
import { DatabaseService } from '@services/database.service.js'

declare module 'fastify' {
  interface FastifyInstance {
    db: DatabaseService
  }
}

export default fp(
  async (fastify: FastifyInstance) => {
    const dbService = new DatabaseService(fastify.log, fastify.config)
    fastify.decorate('db', dbService)

    fastify.addHook('onClose', async () => {
      fastify.log.info('Closing database service...')
      await dbService.close()
    })

    // Check for existing config
    const dbConfig = await dbService.getConfig(1)
    if (dbConfig) {
      // If we have an existing config, update fastify.config with all values
      await fastify.updateConfig({
        ...dbConfig,
        _isReady: dbConfig._isReady, // Preserve the ready state from DB
      })
    } else {
      // No existing config, create one with initial values
      let initialTokens: string[] = []

      try {
        if (Array.isArray(fastify.config.initialPlexTokens)) {
          initialTokens = fastify.config.initialPlexTokens.filter(
            (token): token is string =>
              typeof token === 'string' && token.length > 0,
          )
        } else {
          const parsed = JSON.parse(fastify.config.initialPlexTokens as string)
          if (Array.isArray(parsed)) {
            initialTokens = parsed.filter(
              (token): token is string =>
                typeof token === 'string' && token.length > 0,
            )
          } else {
            fastify.log.warn('initialPlexTokens must be an array of strings')
          }
        }
      } catch (error) {
        fastify.log.warn('Failed to parse initialPlexTokens, using empty array')
      }

      // Create initial config with all default values from fastify.config
      await dbService.createConfig({
        ...fastify.config,
        plexTokens: initialTokens,
        _isReady: false, // Always start as not ready for new configs
      })

      // Update fastify.config to ensure it reflects the saved state
      await fastify.updateConfig({
        plexTokens: initialTokens,
        _isReady: false,
      })
    }
  },
  {
    name: 'database',
    dependencies: ['config'],
  },
)
