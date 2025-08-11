import fp from 'fastify-plugin'
import type { FastifyInstance } from 'fastify'
import { DatabaseService } from '@services/database.service.js'
import type { Config } from '@root/types/config.types.js'

declare module 'fastify' {
  interface FastifyInstance {
    db: DatabaseService
  }
}

export default fp(
  async (fastify: FastifyInstance) => {
    const dbService = await DatabaseService.create(fastify.log, fastify)
    fastify.decorate('db', dbService)
    fastify.addHook('onClose', async () => {
      fastify.log.info('Closing database service...')
      await dbService.close()
    })

    const isSetInEnvironment = (key: string): boolean => {
      return key in process.env
    }

    const initializeConfig = async () => {
      try {
        const dbConfig = await dbService.getConfig()
        const envConfig = { ...fastify.config } as Config

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

          const mergedConfig = { ...parsedDbConfig } as Config

          for (const key of Object.keys(envConfig)) {
            if (isSetInEnvironment(key)) {
              const typedKey = key as keyof Config
              // biome-ignore lint/suspicious/noExplicitAny: This is a necessary type assertion for dynamic property access
              ;(mergedConfig as any)[key] = envConfig[typedKey]
              fastify.log.debug(`Using environment value for ${key}`)
            } else {
              fastify.log.debug(`Keeping database value for ${key}`)
            }
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
              monitorNewItems: mergedConfig.sonarrMonitorNewItems || 'all',
              tags: mergedConfig.sonarrTags || [],
              createSeasonFolders: mergedConfig.sonarrCreateSeasonFolders,
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
              monitorNewItems: initialConfig.sonarrMonitorNewItems || 'all',
              tags: initialConfig.sonarrTags || [],
              createSeasonFolders: initialConfig.sonarrCreateSeasonFolders,
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
        fastify.log.error({ error }, 'Error initializing config:')
        throw error
      }
    }

    try {
      await initializeConfig()
    } catch (error) {
      fastify.log.error({ error }, 'Failed to initialize config:')
    }
  },
  {
    name: 'database',
    dependencies: ['config'],
  },
)
