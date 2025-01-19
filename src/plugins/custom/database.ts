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

    const dbConfig = await dbService.getConfig(1)
    if (dbConfig?.plexTokens) {
      fastify.config.plexTokens = dbConfig.plexTokens
    } else if (fastify.config.initialPlexTokens) {
      let initialTokens: string[] = []
      try {
        const parsed = JSON.parse(fastify.config.initialPlexTokens)
        if (Array.isArray(parsed)) {
          initialTokens = parsed.filter(
            (token): token is string =>
              typeof token === 'string' && token.length > 0,
          )
        } else {
          fastify.log.warn('initialPlexTokens must be an array of strings')
        }
      } catch (error) {
        fastify.log.warn('Failed to parse initialPlexTokens, using empty array')
      }

      await dbService.createConfig({
        port: fastify.config.port,
        plexTokens: initialTokens,
      })
    }
  },
  {
    name: 'database',
    dependencies: ['config'],
  },
)
