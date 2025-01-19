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
  sonarrQualityProfile: number
  sonarrRootFolder: string
  sonarrBypassIgnored: boolean
  sonarrSeasonMonitoring: string
  sonarrTags: string[]
  // Radarr Config
  radarrBaseUrl: string
  radarrApiKey: string
  radarrQualityProfile: number
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

    // Parse JSON strings to arrays after loading
    const config = fastify.config as any
    config.sonarrTags = JSON.parse(config.sonarrTags)
    config.radarrTags = JSON.parse(config.radarrTags)
    config.plexTokens = JSON.parse(config.plexTokens)
    config.initialPlexTokens = JSON.parse(config.initialPlexTokens)

    // Convert empty string to null or 0 for quality profiles
    config.sonarrQualityProfile =
      config.sonarrQualityProfile === ''
        ? null
        : Number(config.sonarrQualityProfile)
    config.radarrQualityProfile =
      config.radarrQualityProfile === ''
        ? null
        : Number(config.radarrQualityProfile)
  },
  { name: 'config' },
)
