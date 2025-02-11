import fp from 'fastify-plugin'
import env from '@fastify/env'
import type { FastifyInstance } from 'fastify'
import type { Config, RawConfig } from '@root/types/config.types.js'
import crypto from 'node:crypto'

const generateSecret = () => crypto.randomBytes(32).toString('hex')

const schema = {
  type: 'object',
  required: ['port'],
  properties: {
    port: {
      type: 'number',
      default: 3003,
    },
    dbPath: {
      type: 'string',
      default: './data/db/plexwatchlist.db',
    },
    cookieSecret: {
      type: 'string',
      default: generateSecret(),
    },
    cookieName: {
      type: 'string',
      default: 'session',
    },
    cookieSecured: {
      type: 'boolean',
      default: false,
    },
    logLevel: {
      type: 'string',
      enum: ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'],
      default: 'error',
    },
    closeGraceDelay: {
      type: 'number',
      default: 1000,
    },
    rateLimitMax: {
      type: 'number',
      default: 500,
    },
    syncIntervalSeconds: {
      type: 'number',
      default: 10,
    },
    queueProcessDelaySeconds: {
      type: 'number',
      default: 60,
    },
    sonarrBaseUrl: {
      type: 'string',
      default: 'http://localhost:8989',
    },
    sonarrApiKey: {
      type: 'string',
      default: 'placeholder',
    },
    sonarrQualityProfile: {
      type: 'string',
      default: '',
    },
    sonarrRootFolder: {
      type: 'string',
      default: '',
    },
    sonarrBypassIgnored: {
      type: 'boolean',
      default: false,
    },
    sonarrSeasonMonitoring: {
      type: 'string',
      default: 'all',
    },
    sonarrTags: {
      type: 'string',
      default: '[]',
    },
    radarrBaseUrl: {
      type: 'string',
      default: 'http://localhost:7878',
    },
    radarrApiKey: {
      type: 'string',
      default: 'placeholder',
    },
    radarrQualityProfile: {
      type: 'string',
      default: '',
    },
    radarrRootFolder: {
      type: 'string',
      default: '',
    },
    radarrBypassIgnored: {
      type: 'boolean',
      default: false,
    },
    radarrTags: {
      type: 'string',
      default: '[]',
    },
    plexTokens: {
      type: 'string',
      default: '[]',
    },
    skipFriendSync: {
      type: 'boolean',
      default: false,
    },
    deleteMovie: {
      type: 'boolean',
      default: false,
    },
    deleteEndedShow: {
      type: 'boolean',
      default: false,
    },
    deleteContinuingShow: {
      type: 'boolean',
      default: false,
    },
    deleteIntervalDays: {
      type: 'number',
      default: 7,
    },
    deleteFiles: {
      type: 'boolean',
      default: true,
    },
    selfRss: {
      type: 'string',
    },
    friendsRss: {
      type: 'string',
    },
  },
}

declare module 'fastify' {
  interface FastifyInstance {
    config: Config
    updateConfig(config: Partial<Config>): Promise<Config>
    waitForConfig(): Promise<void>
  }
}

export default fp(
  async (fastify: FastifyInstance) => {
    let resolveReady: (() => void) | null = null
    const readyPromise = new Promise<void>((resolve) => {
      resolveReady = resolve
    })

    await fastify.register(env, {
      confKey: 'config',
      schema,
      dotenv: {
        path: './.env',
        debug: process.env.NODE_ENV === 'development',
      },
      data: process.env,
    })

    const rawConfig = fastify.config as unknown as RawConfig
    const parsedConfig = {
      ...rawConfig,
      sonarrTags: JSON.parse(rawConfig.sonarrTags || '[]'),
      radarrTags: JSON.parse(rawConfig.radarrTags || '[]'),
      plexTokens: JSON.parse(rawConfig.plexTokens || '[]'),
      _isReady: false,
    }

    parsedConfig.radarrTags = Array.isArray(parsedConfig.radarrTags)
      ? parsedConfig.radarrTags
      : []
    parsedConfig.sonarrTags = Array.isArray(parsedConfig.sonarrTags)
      ? parsedConfig.sonarrTags
      : []
    parsedConfig.plexTokens = Array.isArray(parsedConfig.plexTokens)
      ? parsedConfig.plexTokens
      : []

    fastify.config = parsedConfig as Config

    fastify.decorate('updateConfig', async (newConfig: Partial<Config>) => {
      const updatedConfig = { ...fastify.config, ...newConfig }

      if (newConfig._isReady === true && resolveReady) {
        fastify.log.info('Config is now ready, resolving waitForConfig promise')
        resolveReady()
        resolveReady = null
      }

      fastify.config = updatedConfig

      return updatedConfig
    })

    fastify.decorate('waitForConfig', () => {
      if (fastify.config._isReady) {
        return Promise.resolve()
      }
      return readyPromise
    })
  },
  {
    name: 'config',
  },
)
