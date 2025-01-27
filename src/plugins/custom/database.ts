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

    const initializeConfig = async () => {
      try {
        const dbConfig = await dbService.getConfig(1)

        if (dbConfig) {
          fastify.config = {
            ...fastify.config,
            ...dbConfig,
          }

          if (dbConfig._isReady) {
            fastify.log.info('DB config was ready, updating ready state')
            await fastify.updateConfig({ _isReady: true })
          } else {
            fastify.log.info('DB config was not ready')
          }
        } else {
          fastify.log.info('No existing config found, creating initial config')
          const initialConfig = {
            ...fastify.config,
            _isReady: false,
          }

          fastify.log.info('Creating initial config in database')
          await dbService.createConfig(initialConfig)
          await fastify.updateConfig({ _isReady: false })
        }
      } catch (error) {
        fastify.log.error('Error initializing config:', error)
        throw error
      }
    }

    setImmediate(async () => {
      try {
        await initializeConfig()
      } catch (error) {
        fastify.log.error('Failed to initialize config:', error)
      }
    })
  },
  {
    name: 'database',
    dependencies: ['config'],
  },
)
