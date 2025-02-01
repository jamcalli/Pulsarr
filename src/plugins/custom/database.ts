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
          // Parse any JSON string arrays from DB
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

          await fastify.updateConfig(parsedDbConfig)

          if (dbConfig._isReady) {
            fastify.log.info('DB config was ready, updating ready state')
            await fastify.updateConfig({ _isReady: true })
          } else {
            fastify.log.info('DB config was not ready')
          }

          // Check and create instances if needed
          const [existingSonarrInstances, existingRadarrInstances] =
            await Promise.all([
              dbService.getAllSonarrInstances(),
              dbService.getAllRadarrInstances(),
            ])

          // Handle Sonarr instance creation
          if (
            existingSonarrInstances.length === 0 &&
            fastify.config.sonarrBaseUrl
          ) {
            fastify.log.info('Creating default Sonarr instance from .env')

            await dbService.createSonarrInstance({
              name: 'Default Sonarr Instance',
              baseUrl: fastify.config.sonarrBaseUrl,
              apiKey: fastify.config.sonarrApiKey,
              qualityProfile: fastify.config.sonarrQualityProfile,
              rootFolder: fastify.config.sonarrRootFolder,
              bypassIgnored: fastify.config.sonarrBypassIgnored,
              seasonMonitoring: fastify.config.sonarrSeasonMonitoring,
              tags: fastify.config.sonarrTags || [],
              isDefault: true,
            })
          }

          // Handle Radarr instance creation
          if (
            existingRadarrInstances.length === 0 &&
            fastify.config.radarrBaseUrl
          ) {
            fastify.log.info('Creating default Radarr instance from .env')

            await dbService.createRadarrInstance({
              name: 'Default Radarr Instance',
              baseUrl: fastify.config.radarrBaseUrl,
              apiKey: fastify.config.radarrApiKey,
              qualityProfile: fastify.config.radarrQualityProfile,
              rootFolder: fastify.config.radarrRootFolder,
              bypassIgnored: fastify.config.radarrBypassIgnored,
              tags: fastify.config.radarrTags || [],
              isDefault: true,
            })
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

          // Create default instances if configs are present
          if (fastify.config.sonarrBaseUrl) {
            fastify.log.info('Creating default Sonarr instance from .env')

            await dbService.createSonarrInstance({
              name: 'Default Sonarr Instance',
              baseUrl: fastify.config.sonarrBaseUrl,
              apiKey: fastify.config.sonarrApiKey,
              qualityProfile: fastify.config.sonarrQualityProfile,
              rootFolder: fastify.config.sonarrRootFolder,
              bypassIgnored: fastify.config.sonarrBypassIgnored,
              seasonMonitoring: fastify.config.sonarrSeasonMonitoring,
              tags: fastify.config.sonarrTags || [],
              isDefault: true,
            })
          }

          if (fastify.config.radarrBaseUrl) {
            fastify.log.info('Creating default Radarr instance from .env')

            await dbService.createRadarrInstance({
              name: 'Default Radarr Instance',
              baseUrl: fastify.config.radarrBaseUrl,
              apiKey: fastify.config.radarrApiKey,
              qualityProfile: fastify.config.radarrQualityProfile,
              rootFolder: fastify.config.radarrRootFolder,
              bypassIgnored: fastify.config.radarrBypassIgnored,
              tags: fastify.config.radarrTags || [],
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
