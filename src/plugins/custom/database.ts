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
        const envConfig = { ...fastify.config }

        if (dbConfig) {

          const parsedDbConfig = {
            ...dbConfig,
            plexTokens: Array.isArray(dbConfig.plexTokens)
              ? dbConfig.plexTokens
              : JSON.parse(dbConfig.plexTokens || '[]'),
            radarrTags: Array.isArray(dbConfig.radarrTags)
              ? dbConfig.radarrTags
              : JSON.parse(dbConfig.radarrTags || '[]'),
            sonarrTags: Array.isArray(dbConfig.sonarrTags)
              ? dbConfig.sonarrTags
              : JSON.parse(dbConfig.sonarrTags || '[]'),
          }

          const mergedConfig = {
            ...parsedDbConfig,
            ...envConfig,
          }

          await fastify.updateConfig(mergedConfig)

          if (dbConfig._isReady) {
            fastify.log.info('DB config was ready, updating ready state')
            await fastify.updateConfig({ _isReady: true })
          } else {
            fastify.log.info('DB config was not ready')
          }

          const [existingSonarrInstances, existingRadarrInstances] =
            await Promise.all([
              dbService.getAllSonarrInstances(),
              dbService.getAllRadarrInstances(),
            ])

          if (
            existingSonarrInstances.length === 0 &&
            mergedConfig.sonarrBaseUrl
          ) {
            fastify.log.info('Creating default Sonarr instance from .env')

            await dbService.createSonarrInstance({
              name: 'Default Sonarr Instance',
              baseUrl: mergedConfig.sonarrBaseUrl,
              apiKey: mergedConfig.sonarrApiKey,
              qualityProfile: mergedConfig.sonarrQualityProfile,
              rootFolder: mergedConfig.sonarrRootFolder,
              bypassIgnored: mergedConfig.sonarrBypassIgnored,
              seasonMonitoring: mergedConfig.sonarrSeasonMonitoring,
              tags: mergedConfig.sonarrTags || [],
              isDefault: true,
            })
          }

          if (
            existingRadarrInstances.length === 0 &&
            mergedConfig.radarrBaseUrl
          ) {
            fastify.log.info('Creating default Radarr instance from .env')

            await dbService.createRadarrInstance({
              name: 'Default Radarr Instance',
              baseUrl: mergedConfig.radarrBaseUrl,
              apiKey: mergedConfig.radarrApiKey,
              qualityProfile: mergedConfig.radarrQualityProfile,
              rootFolder: mergedConfig.radarrRootFolder,
              bypassIgnored: mergedConfig.radarrBypassIgnored,
              tags: mergedConfig.radarrTags || [],
              isDefault: true,
            })
          }
        } else {
          fastify.log.info('No existing config found, creating initial config')
          const initialConfig = {
            ...envConfig,
            _isReady: false,
          }

          fastify.log.info('Creating initial config in database')
          await dbService.createConfig(initialConfig)
          await fastify.updateConfig({ _isReady: false })

          if (initialConfig.sonarrBaseUrl) {
            fastify.log.info('Creating default Sonarr instance from .env')

            await dbService.createSonarrInstance({
              name: 'Default Sonarr Instance',
              baseUrl: initialConfig.sonarrBaseUrl,
              apiKey: initialConfig.sonarrApiKey,
              qualityProfile: initialConfig.sonarrQualityProfile,
              rootFolder: initialConfig.sonarrRootFolder,
              bypassIgnored: initialConfig.sonarrBypassIgnored,
              seasonMonitoring: initialConfig.sonarrSeasonMonitoring,
              tags: initialConfig.sonarrTags || [],
              isDefault: true,
            })
          }

          if (initialConfig.radarrBaseUrl) {
            fastify.log.info('Creating default Radarr instance from .env')

            await dbService.createRadarrInstance({
              name: 'Default Radarr Instance',
              baseUrl: initialConfig.radarrBaseUrl,
              apiKey: initialConfig.radarrApiKey,
              qualityProfile: initialConfig.radarrQualityProfile,
              rootFolder: initialConfig.radarrRootFolder,
              bypassIgnored: initialConfig.radarrBypassIgnored,
              tags: initialConfig.radarrTags || [],
              isDefault: true,
            })
          }
        }
      } catch (error) {
        fastify.log.error('Error initializing config:', error)
        throw error
      }
    }

    try {
      await initializeConfig()
    } catch (error) {
      console.log('Error initializing config:', error)
      fastify.log.error('Failed to initialize config:', error)
    }
  },
  {
    name: 'database',
    dependencies: ['config'],
  },
)