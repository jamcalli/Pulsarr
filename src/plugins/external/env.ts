import fp from 'fastify-plugin'
import env from '@fastify/env'
import type { FastifyInstance } from 'fastify'

interface Config {
  port: number
  dbPath: string
  cookieSecret: string
  cookieName: string
  cookieSecured: boolean
  initialPlexTokens: string[]
  logLevel: string
  closeGraceDelay: number
  rateLimitMax: number
  syncIntervalSeconds: number
  // Sonarr Config
  sonarrBaseUrl: string
  sonarrApiKey: string
  sonarrQualityProfile: string
  sonarrRootFolder: string
  sonarrBypassIgnored: boolean
  sonarrSeasonMonitoring: string
  sonarrTags: string[]
  // Radarr Config
  radarrBaseUrl: string
  radarrApiKey: string
  radarrQualityProfile: string
  radarrRootFolder: string
  radarrBypassIgnored: boolean
  radarrTags: string[]
  // Plex Config
  plexTokens: string[]
  skipFriendSync: boolean
  // Delete Config
  deleteMovie: boolean
  deleteEndedShow: boolean
  deleteContinuingShow: boolean
  deleteIntervalDays: number
  deleteFiles: boolean
}

type RawConfig = {
  [K in keyof Config]: Config[K] extends string[] ? string : Config[K]
}

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
      default: 'change-me-in-production',
    },
    cookieName: {
      type: 'string',
      default: 'session',
    },
    cookieSecured: {
      type: 'boolean',
      default: false,
    },
    initialPlexTokens: {
      type: 'string',
      default: '[]',
    },
    logLevel: {
      type: 'string',
      default: 'silent',
      enum: ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'],
    },
    closeGraceDelay: {
      type: 'number',
      default: 500,
    },
    rateLimitMax: {
      type: 'number',
      default: 100,
    },
    syncIntervalSeconds: {
      type: 'number',
      default: 10,
    },
    // Sonarr Configuration
    sonarrBaseUrl: {
      type: 'string',
      default: 'localhost:8989',
    },
    sonarrApiKey: {
      type: 'string',
      default: '',
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
    // Radarr Configuration
    radarrBaseUrl: {
      type: 'string',
      default: 'localhost:7878',
    },
    radarrApiKey: {
      type: 'string',
      default: '',
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
    // Plex Configuration
    plexTokens: {
      type: 'string',
      default: '[]',
    },
    skipFriendSync: {
      type: 'boolean',
      default: false,
    },
    // Delete Configuration
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
  },
}

declare module 'fastify' {
  export interface FastifyInstance {
    config: Config
    updateConfig(config: Partial<Config>): Promise<Config>
  }
}

export default fp(
  async (fastify: FastifyInstance) => {
    await fastify.register(env, {
      confKey: 'config',
      schema: schema,
      dotenv: true,
      data: process.env,
    })

    // Get the raw config and parse JSON strings to arrays
    const rawConfig = fastify.config as unknown as RawConfig
    const parsedConfig = {
      ...rawConfig,
      sonarrTags: JSON.parse(rawConfig.sonarrTags),
      radarrTags: JSON.parse(rawConfig.radarrTags),
      plexTokens: JSON.parse(rawConfig.plexTokens),
      initialPlexTokens: JSON.parse(rawConfig.initialPlexTokens),
    }

    // Ensure arrays are initialized even if empty
    parsedConfig.radarrTags = Array.isArray(parsedConfig.radarrTags)
      ? parsedConfig.radarrTags
      : []
    parsedConfig.sonarrTags = Array.isArray(parsedConfig.sonarrTags)
      ? parsedConfig.sonarrTags
      : []
    parsedConfig.plexTokens = Array.isArray(parsedConfig.plexTokens)
      ? parsedConfig.plexTokens
      : []
    parsedConfig.initialPlexTokens = Array.isArray(
      parsedConfig.initialPlexTokens,
    )
      ? parsedConfig.initialPlexTokens
      : []

    // Assign the fully parsed config back
    fastify.config = parsedConfig as Config
  },
  { name: 'config' },
)
