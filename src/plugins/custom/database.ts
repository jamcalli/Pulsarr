import { DatabaseService } from '@services/database.service.js'
import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'
import type { Knex } from 'knex'

declare module 'fastify' {
  interface FastifyInstance {
    db: DatabaseService
  }
}

export default fp(
  async (fastify: FastifyInstance) => {
    let testKnex: Knex | undefined
    if (process.env.NODE_ENV === 'test') {
      // Import test database helper - uses globalThis for connection sharing
      const dbModule = await import(
        new URL('../../../test/helpers/database.js', import.meta.url).href
      )
      testKnex = await dbModule.initializeTestDatabase()
    }
    const dbService = await DatabaseService.create(
      fastify.log,
      fastify,
      testKnex,
    )
    fastify.decorate('db', dbService)
    fastify.addHook('onClose', async () => {
      if (process.env.NODE_ENV !== 'test') {
        fastify.log.info('Closing database service...')
        await dbService.close()
      }
    })

    const isSetInEnvironment = (key: string): boolean => {
      return key in process.env
    }

    const initializeConfig = async () => {
      try {
        const dbConfig = await dbService.getConfig()
        const envConfig = fastify.config

        if (dbConfig) {
          // Merge env config with database config
          // Environment variables take precedence over database values
          // Filter dbConfig entries to exclude fields set via environment
          const dbOverrides = Object.fromEntries(
            Object.entries(dbConfig).filter(([key]) => {
              const isEnvSet = isSetInEnvironment(key)
              if (isEnvSet) {
                fastify.log.debug(`Using environment value for ${key}`)
              }
              return !isEnvSet
            }),
          )

          const mergedConfig = {
            ...envConfig,
            ...dbOverrides,
          }

          await fastify.updateConfig(mergedConfig)

          if (dbConfig._isReady) {
            fastify.log.debug('DB config was ready, updating ready state')
            await fastify.updateConfig({ _isReady: true })
          } else {
            fastify.log.debug('DB config was not ready')
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
          fastify.log.debug('Creating initial config in database')
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
        const err = error instanceof Error ? error : new Error(String(error))
        fastify.log.error(err, 'Error initializing config')
        throw error
      }
    }

    try {
      await initializeConfig()
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error))
      fastify.log.error(err, 'Failed to initialize config')
      throw error
    }
  },
  {
    name: 'database',
    dependencies: ['config'],
  },
)
