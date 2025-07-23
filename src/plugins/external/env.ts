import fp from 'fastify-plugin'
import env from '@fastify/env'
import type { FastifyInstance } from 'fastify'
import type { Config, RawConfig } from '@root/types/config.types.js'
import crypto from 'node:crypto'

const generateSecret = () => crypto.randomBytes(32).toString('hex')

const DEFAULT_PLEX_SESSION_MONITORING = {
  enabled: false,
  pollingIntervalMinutes: 15,
  remainingEpisodes: 2,
  filterUsers: [],
  enableAutoReset: true,
  inactivityResetDays: 7,
  autoResetIntervalHours: 24,
  enableProgressiveCleanup: false,
}

const DEFAULT_PUBLIC_CONTENT_NOTIFICATIONS = {
  enabled: false,
  discordWebhookUrls: '',
  discordWebhookUrlsMovies: '',
  discordWebhookUrlsShows: '',
  appriseUrls: '',
  appriseUrlsMovies: '',
  appriseUrlsShows: '',
}

const DEFAULT_QUOTA_SETTINGS = {
  cleanup: {
    enabled: true,
    retentionDays: 90,
  },
  weeklyRolling: {
    resetDays: 7,
  },
  monthly: {
    resetDay: 1,
    handleMonthEnd: 'last-day' as const,
  },
}

const DEFAULT_APPROVAL_EXPIRATION = {
  enabled: false,
  defaultExpirationHours: 72,
  expirationAction: 'expire' as const,
  cleanupExpiredDays: 30,
}

const schema = {
  type: 'object',
  required: ['port'],
  properties: {
    baseUrl: {
      type: 'string',
      default: 'http://localhost',
    },
    port: {
      type: 'number',
      default: 3003,
    },
    dbType: {
      type: 'string',
      enum: ['sqlite', 'postgres'],
      default: 'sqlite',
    },
    dbPath: {
      type: 'string',
      default: './data/db/pulsarr.db',
    },
    dbHost: {
      type: 'string',
      default: 'localhost',
    },
    dbPort: {
      type: 'number',
      default: 5432,
    },
    dbName: {
      type: 'string',
      default: 'pulsarr',
    },
    dbUser: {
      type: 'string',
      default: 'postgres',
    },
    dbPassword: {
      type: 'string',
      default: 'pulsarrpostgrespw',
    },
    dbConnectionString: {
      type: 'string',
      default: '',
    },
    cookieSecret: {
      type: 'string',
      default: generateSecret(),
    },
    cookieName: {
      type: 'string',
      default: 'pulsarr',
    },
    cookieSecured: {
      type: 'boolean',
      default: false,
    },
    logLevel: {
      type: 'string',
      enum: ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'],
      default: 'info',
    },
    closeGraceDelay: {
      type: 'number',
      default: 10000,
    },
    rateLimitMax: {
      type: 'number',
      default: 500,
    },
    authenticationMethod: {
      type: 'string',
      enum: ['required', 'requiredExceptLocal', 'disabled'],
      default: 'required',
    },
    syncIntervalSeconds: {
      type: 'number',
      default: 10,
    },
    queueProcessDelaySeconds: {
      type: 'number',
      default: 60,
    },
    discordWebhookUrl: {
      type: 'string',
      default: '',
    },
    discordBotToken: {
      type: 'string',
      default: '',
    },
    discordClientId: {
      type: 'string',
      default: '',
    },
    discordGuildId: {
      type: 'string',
      default: '',
    },
    enableApprise: {
      type: 'boolean',
      default: false,
    },
    appriseUrl: {
      type: 'string',
      default: '',
    },
    systemAppriseUrl: {
      type: 'string',
      default: '',
    },
    // Public Content Notifications
    publicContentNotifications: {
      type: 'string',
      default: JSON.stringify(DEFAULT_PUBLIC_CONTENT_NOTIFICATIONS),
    },
    queueWaitTime: {
      type: 'number',
      default: 120000,
    },
    newEpisodeThreshold: {
      type: 'number',
      default: 172800000,
    },
    tautulliUrl: {
      type: 'string',
      default: '',
    },
    tautulliApiKey: {
      type: 'string',
      default: '',
    },
    tautulliEnabled: {
      type: 'boolean',
      default: false,
    },
    upgradeBufferTime: {
      type: 'number',
      default: 2000,
    },
    pendingWebhookRetryInterval: {
      type: 'number',
      default: 20,
    },
    pendingWebhookMaxAge: {
      type: 'number',
      default: 10,
    },
    pendingWebhookCleanupInterval: {
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
    sonarrMonitorNewItems: {
      type: 'string',
      enum: ['all', 'none'],
      default: 'all',
    },
    sonarrTags: {
      type: 'string',
      default: '[]',
    },
    sonarrCreateSeasonFolders: {
      type: 'boolean',
      default: false,
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
    // TMDB Config (Read Access Token is env-only, region stored in DB)
    tmdbApiKey: {
      type: 'string',
      default: '',
    },
    plexTokens: {
      type: 'string',
      default: '[]',
    },
    skipFriendSync: {
      type: 'boolean',
      default: false,
    },
    plexServerUrl: {
      type: 'string',
      default: 'http://localhost:32400',
    },
    enablePlexPlaylistProtection: {
      type: 'boolean',
      default: false,
    },
    plexProtectionPlaylistName: {
      type: 'string',
      default: 'Do Not Delete',
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
    deleteFiles: {
      type: 'boolean',
      default: true,
    },
    respectUserSyncSetting: {
      type: 'boolean',
      default: true,
    },
    deleteSyncNotify: {
      type: 'string',
      enum: [
        'none',
        'message',
        'webhook',
        'both',
        'all',
        'discord-only',
        'apprise-only',
        'webhook-only',
        'dm-only',
        'discord-webhook',
        'discord-message',
        'discord-both',
      ],
      default: 'none',
    },
    deleteSyncNotifyOnlyOnDeletion: {
      type: 'boolean',
      default: false,
    },
    approvalNotify: {
      type: 'string',
      enum: [
        'none',
        'all',
        'discord-only',
        'apprise-only',
        'webhook-only',
        'dm-only',
        'discord-webhook',
        'discord-message',
        'discord-both',
      ],
      default: 'none',
    },
    maxDeletionPrevention: {
      type: 'number',
      default: 10,
    },
    selfRss: {
      type: 'string',
    },
    friendsRss: {
      type: 'string',
    },
    tagUsersInSonarr: {
      type: 'boolean',
      default: false,
    },
    tagUsersInRadarr: {
      type: 'boolean',
      default: false,
    },
    cleanupOrphanedTags: {
      type: 'boolean',
      default: true,
    },
    tagPrefix: {
      type: 'string',
      default: 'pulsarr:user',
    },
    removedTagMode: {
      type: 'string',
      enum: ['remove', 'keep', 'special-tag'],
      default: 'remove',
    },
    removedTagPrefix: {
      type: 'string',
      default: 'pulsarr:removed',
    },
    deletionMode: {
      type: 'string',
      enum: ['watchlist', 'tag-based'],
      default: 'watchlist',
    },
    plexSessionMonitoring: {
      type: 'string',
      default: JSON.stringify(DEFAULT_PLEX_SESSION_MONITORING),
    },
    newUserDefaultCanSync: {
      type: 'boolean',
      default: true,
    },
    newUserDefaultRequiresApproval: {
      type: 'boolean',
      default: false,
    },
    newUserDefaultMovieQuotaEnabled: {
      type: 'boolean',
      default: false,
    },
    newUserDefaultMovieQuotaType: {
      type: 'string',
      enum: ['daily', 'weekly_rolling', 'monthly'],
      default: 'monthly',
    },
    newUserDefaultMovieQuotaLimit: {
      type: 'number',
      default: 10,
    },
    newUserDefaultMovieBypassApproval: {
      type: 'boolean',
      default: false,
    },
    newUserDefaultShowQuotaEnabled: {
      type: 'boolean',
      default: false,
    },
    newUserDefaultShowQuotaType: {
      type: 'string',
      enum: ['daily', 'weekly_rolling', 'monthly'],
      default: 'monthly',
    },
    newUserDefaultShowQuotaLimit: {
      type: 'number',
      default: 10,
    },
    newUserDefaultShowBypassApproval: {
      type: 'boolean',
      default: false,
    },
    allowIframes: {
      type: 'boolean',
      default: false,
    },
    // Quota System Configuration
    quotaSettings: {
      type: 'string',
      default: JSON.stringify(DEFAULT_QUOTA_SETTINGS),
    },
    // Approval System Configuration
    approvalExpiration: {
      type: 'string',
      default: JSON.stringify(DEFAULT_APPROVAL_EXPIRATION),
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

    // Helper function to safely parse JSON with error handling
    const safeJsonParse = <T>(
      value: string | undefined,
      defaultValue: T,
      fieldName: string,
    ): T => {
      if (!value) return defaultValue
      try {
        return JSON.parse(value)
      } catch (error) {
        fastify.log.warn(
          `Failed to parse ${fieldName} config, using default:`,
          error,
        )
        return defaultValue
      }
    }

    const parsedConfig = {
      ...rawConfig,
      sonarrTags: safeJsonParse(rawConfig.sonarrTags, [], 'sonarrTags'),
      radarrTags: safeJsonParse(rawConfig.radarrTags, [], 'radarrTags'),
      plexTokens: safeJsonParse(rawConfig.plexTokens, [], 'plexTokens'),
      plexSessionMonitoring: rawConfig.plexSessionMonitoring
        ? safeJsonParse(
            rawConfig.plexSessionMonitoring as string,
            DEFAULT_PLEX_SESSION_MONITORING,
            'plexSessionMonitoring',
          )
        : undefined,
      publicContentNotifications: rawConfig.publicContentNotifications
        ? safeJsonParse(
            rawConfig.publicContentNotifications as string,
            DEFAULT_PUBLIC_CONTENT_NOTIFICATIONS,
            'publicContentNotifications',
          )
        : DEFAULT_PUBLIC_CONTENT_NOTIFICATIONS,
      quotaSettings: rawConfig.quotaSettings
        ? safeJsonParse(
            rawConfig.quotaSettings as string,
            DEFAULT_QUOTA_SETTINGS,
            'quotaSettings',
          )
        : DEFAULT_QUOTA_SETTINGS,
      approvalExpiration: rawConfig.approvalExpiration
        ? safeJsonParse(
            rawConfig.approvalExpiration as string,
            DEFAULT_APPROVAL_EXPIRATION,
            'approvalExpiration',
          )
        : DEFAULT_APPROVAL_EXPIRATION,
      _isReady: false,
    }

    // Ensure arrays are arrays (in case parsed value is not an array)
    parsedConfig.radarrTags = Array.isArray(parsedConfig.radarrTags)
      ? parsedConfig.radarrTags
      : []
    parsedConfig.sonarrTags = Array.isArray(parsedConfig.sonarrTags)
      ? parsedConfig.sonarrTags
      : []
    parsedConfig.plexTokens = Array.isArray(parsedConfig.plexTokens)
      ? parsedConfig.plexTokens
      : []

    // Validate PostgreSQL configuration for security
    if (parsedConfig.dbType === 'postgres') {
      const isUsingConnectionString =
        parsedConfig.dbConnectionString &&
        parsedConfig.dbConnectionString.trim() !== ''

      if (isUsingConnectionString) {
        // Basic validation of connection string format
        const connStr = parsedConfig.dbConnectionString.trim()
        if (
          !connStr.startsWith('postgres://') &&
          !connStr.startsWith('postgresql://')
        ) {
          throw new Error(
            'Invalid PostgreSQL connection string format. Must start with postgres:// or postgresql://',
          )
        }
      }

      if (!isUsingConnectionString) {
        // Validate individual connection parameters
        if (!parsedConfig.dbPassword || parsedConfig.dbPassword.trim() === '') {
          fastify.log.error(
            'PostgreSQL database selected but no password provided. This is a security risk.',
          )
          throw new Error(
            'dbPassword is required when using PostgreSQL. Please set a secure password.',
          )
        }

        if (parsedConfig.dbPassword === 'pulsarrpostgrespw') {
          fastify.log.warn(
            'WARNING: Using default PostgreSQL password. Please change this for production deployments!',
          )
        }

        if (!parsedConfig.dbHost || parsedConfig.dbHost.trim() === '') {
          throw new Error('dbHost is required when using PostgreSQL.')
        }

        if (!parsedConfig.dbName || parsedConfig.dbName.trim() === '') {
          throw new Error('dbName is required when using PostgreSQL.')
        }

        if (!parsedConfig.dbUser || parsedConfig.dbUser.trim() === '') {
          throw new Error('dbUser is required when using PostgreSQL.')
        }
      }
    }

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
