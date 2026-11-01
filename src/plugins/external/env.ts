import crypto from 'node:crypto'
import { resolve } from 'node:path'
import env from '@fastify/env'
import {
  ConfigLogLevelSchema,
  DEFAULT_PULSARR_PORT,
  DELETE_SYNC_NOTIFY_OPTIONS,
  DELETION_MODES,
  MAINTAINERR_EXCLUSION_MODES,
  NOTIFY_OPTIONS,
  PLEX_SERVER_URL_DEFAULT,
} from '@root/schemas/config/config.schema.js'
import {
  DEFAULT_APPROVAL_EXPIRATION,
  DEFAULT_PUBLIC_CONTENT_NOTIFICATIONS,
  DEFAULT_QUOTA_SETTINGS,
  type PublicConfigPatch,
  STORED_CONFIG_DEFAULTS,
} from '@root/schemas/config/config-defaults.js'
import { PLEX_EXISTENCE_SCOPES } from '@root/schemas/plex/existence-scope.schema.js'
import {
  PLEX_LABEL_SYNC_DEFAULTS,
  type PlexLabelSyncConfig,
} from '@root/schemas/plex/label-sync-config.schema.js'
import { PLEX_SESSION_MONITORING_DEFAULTS } from '@root/schemas/session-monitoring/session-monitoring-config.schema.js'
import { QuotaTypeSchema } from '@root/schemas/shared/quota-type.schema.js'
import type { Config, RawConfig } from '@root/types/config.types.js'
import { parseAllowedHosts } from '@utils/allowed-hosts.js'
import { resolveDataDir } from '@utils/data-dir.js'
import { parseJsonOr } from '@utils/json.js'
import { parseAllowedOrigins } from '@utils/request-origin.js'
import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'

const generateSecret = () => crypto.randomBytes(32).toString('hex')

// Resolve data directory deterministically from platform (Windows/macOS)
// or fall back to project-relative paths (Linux/Docker)
const dataDir = resolveDataDir()

const schema = {
  type: 'object',
  required: ['port'],
  properties: {
    basePath: {
      type: 'string',
      default: '/',
    },
    baseUrl: {
      type: 'string',
      default: 'http://localhost',
    },
    port: {
      type: 'number',
      default: STORED_CONFIG_DEFAULTS.port,
    },
    listenPort: {
      type: 'number',
      default: DEFAULT_PULSARR_PORT,
    },
    dbType: {
      type: 'string',
      enum: ['sqlite', 'postgres'],
      default: 'sqlite',
    },
    dbPath: {
      type: 'string',
      default: dataDir
        ? resolve(dataDir, 'db', 'pulsarr.db')
        : './data/db/pulsarr.db',
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
      // @fastify/session requires 32+ chars
      minLength: 32,
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
    webhookSecret: {
      type: 'string',
      minLength: 16,
      default: generateSecret(),
    },
    maintainerrEnabled: {
      type: 'boolean',
      default: STORED_CONFIG_DEFAULTS.maintainerrEnabled,
    },
    maintainerrUrl: {
      type: 'string',
      default: STORED_CONFIG_DEFAULTS.maintainerrUrl,
    },
    maintainerrWebhookSecret: {
      type: 'string',
      minLength: 16,
      default: generateSecret(),
    },
    maintainerrExclusionMode: {
      type: 'string',
      enum: MAINTAINERR_EXCLUSION_MODES,
      default: STORED_CONFIG_DEFAULTS.maintainerrExclusionMode,
    },
    logLevel: {
      type: 'string',
      enum: ConfigLogLevelSchema.options,
      default: STORED_CONFIG_DEFAULTS.logLevel,
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
    allowedOrigins: {
      type: 'string',
      default: '',
    },
    allowedHosts: {
      type: 'string',
      default: '',
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
    enableApprise: {
      type: 'boolean',
      default: STORED_CONFIG_DEFAULTS.enableApprise,
    },
    appriseUrl: {
      type: 'string',
      default: STORED_CONFIG_DEFAULTS.appriseUrl,
    },
    systemAppriseUrl: {
      type: 'string',
      default: '',
    },
    appriseEmailSender: {
      type: 'string',
      default: '',
    },
    // Public Content Notifications
    publicContentNotifications: {
      type: 'string',
      default: JSON.stringify(
        STORED_CONFIG_DEFAULTS.publicContentNotifications,
      ),
    },
    queueWaitTime: {
      type: 'number',
      default: STORED_CONFIG_DEFAULTS.queueWaitTime,
    },
    newEpisodeThreshold: {
      type: 'number',
      default: STORED_CONFIG_DEFAULTS.newEpisodeThreshold,
    },
    plexMobileEnabled: {
      type: 'boolean',
      default: STORED_CONFIG_DEFAULTS.plexMobileEnabled,
    },
    pendingWebhookRetryInterval: {
      type: 'number',
      default: STORED_CONFIG_DEFAULTS.pendingWebhookRetryInterval,
    },
    pendingWebhookMaxAge: {
      type: 'number',
      default: STORED_CONFIG_DEFAULTS.pendingWebhookMaxAge,
    },
    pendingWebhookCleanupInterval: {
      type: 'number',
      default: STORED_CONFIG_DEFAULTS.pendingWebhookCleanupInterval,
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
    // TMDB Config
    tmdbApiKey: {
      type: 'string',
      default: '',
    },
    tmdbRegion: {
      type: 'string',
      default: STORED_CONFIG_DEFAULTS.tmdbRegion,
    },
    plexTokens: {
      type: 'string',
      default: JSON.stringify(STORED_CONFIG_DEFAULTS.plexTokens),
    },
    skipFriendSync: {
      type: 'boolean',
      default: STORED_CONFIG_DEFAULTS.skipFriendSync,
    },
    plexServerUrl: {
      type: 'string',
      default: PLEX_SERVER_URL_DEFAULT,
    },
    skipIfExistsOnPlex: {
      type: 'boolean',
      default: STORED_CONFIG_DEFAULTS.skipIfExistsOnPlex,
    },
    plexExistenceScope: {
      type: 'string',
      enum: PLEX_EXISTENCE_SCOPES,
      default: STORED_CONFIG_DEFAULTS.plexExistenceScope,
    },
    enablePlexPlaylistProtection: {
      type: 'boolean',
      default: STORED_CONFIG_DEFAULTS.enablePlexPlaylistProtection,
    },
    plexProtectionPlaylistName: {
      type: 'string',
      default: STORED_CONFIG_DEFAULTS.plexProtectionPlaylistName,
    },
    deleteMovie: {
      type: 'boolean',
      default: STORED_CONFIG_DEFAULTS.deleteMovie,
    },
    deleteEndedShow: {
      type: 'boolean',
      default: STORED_CONFIG_DEFAULTS.deleteEndedShow,
    },
    deleteContinuingShow: {
      type: 'boolean',
      default: STORED_CONFIG_DEFAULTS.deleteContinuingShow,
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
      enum: DELETE_SYNC_NOTIFY_OPTIONS,
      default: STORED_CONFIG_DEFAULTS.deleteSyncNotify,
    },
    deleteSyncNotifyOnlyOnDeletion: {
      type: 'boolean',
      default: STORED_CONFIG_DEFAULTS.deleteSyncNotifyOnlyOnDeletion,
    },
    deleteSyncTrackedOnly: {
      type: 'boolean',
      default: STORED_CONFIG_DEFAULTS.deleteSyncTrackedOnly,
    },
    deleteSyncCleanupApprovals: {
      type: 'boolean',
      default: STORED_CONFIG_DEFAULTS.deleteSyncCleanupApprovals,
    },
    deleteSyncRequiredTagRegex: {
      type: 'string',
    },
    approvalNotify: {
      type: 'string',
      enum: NOTIFY_OPTIONS,
      default: STORED_CONFIG_DEFAULTS.approvalNotify,
    },
    maxDeletionPrevention: {
      type: 'number',
      default: STORED_CONFIG_DEFAULTS.maxDeletionPrevention,
    },
    selfRss: {
      type: 'string',
    },
    friendsRss: {
      type: 'string',
    },
    tagUsersInSonarr: {
      type: 'boolean',
      default: STORED_CONFIG_DEFAULTS.tagUsersInSonarr,
    },
    tagUsersInRadarr: {
      type: 'boolean',
      default: STORED_CONFIG_DEFAULTS.tagUsersInRadarr,
    },
    cleanupOrphanedTags: {
      type: 'boolean',
      default: true,
    },
    tagPrefix: {
      type: 'string',
      default: STORED_CONFIG_DEFAULTS.tagPrefix,
    },
    tagNamingSource: {
      type: 'string',
      enum: ['username', 'alias'],
      default: STORED_CONFIG_DEFAULTS.tagNamingSource,
    },
    removedTagMode: {
      type: 'string',
      enum: ['remove', 'keep', 'special-tag'],
      default: STORED_CONFIG_DEFAULTS.removedTagMode,
    },
    removedTagPrefix: {
      type: 'string',
      default: STORED_CONFIG_DEFAULTS.removedTagPrefix,
    },
    deletionMode: {
      type: 'string',
      enum: DELETION_MODES,
      default: STORED_CONFIG_DEFAULTS.deletionMode,
    },
    plexSessionMonitoring: {
      type: 'string',
      default: JSON.stringify(PLEX_SESSION_MONITORING_DEFAULTS),
    },
    newUserDefaultCanSync: {
      type: 'boolean',
      default: STORED_CONFIG_DEFAULTS.newUserDefaultCanSync,
    },
    newUserDefaultRequiresApproval: {
      type: 'boolean',
      default: STORED_CONFIG_DEFAULTS.newUserDefaultRequiresApproval,
    },
    newUserDefaultMovieQuotaEnabled: {
      type: 'boolean',
      default: STORED_CONFIG_DEFAULTS.newUserDefaultMovieQuotaEnabled,
    },
    newUserDefaultMovieQuotaType: {
      type: 'string',
      enum: QuotaTypeSchema.options,
      default: STORED_CONFIG_DEFAULTS.newUserDefaultMovieQuotaType,
    },
    newUserDefaultMovieQuotaLimit: {
      type: 'number',
      default: STORED_CONFIG_DEFAULTS.newUserDefaultMovieQuotaLimit,
    },
    newUserDefaultMovieBypassApproval: {
      type: 'boolean',
      default: STORED_CONFIG_DEFAULTS.newUserDefaultMovieBypassApproval,
    },
    newUserDefaultShowQuotaEnabled: {
      type: 'boolean',
      default: STORED_CONFIG_DEFAULTS.newUserDefaultShowQuotaEnabled,
    },
    newUserDefaultShowQuotaType: {
      type: 'string',
      enum: QuotaTypeSchema.options,
      default: STORED_CONFIG_DEFAULTS.newUserDefaultShowQuotaType,
    },
    newUserDefaultShowQuotaLimit: {
      type: 'number',
      default: STORED_CONFIG_DEFAULTS.newUserDefaultShowQuotaLimit,
    },
    newUserDefaultShowBypassApproval: {
      type: 'boolean',
      default: STORED_CONFIG_DEFAULTS.newUserDefaultShowBypassApproval,
    },
    allowIframes: {
      type: 'boolean',
      default: false,
    },
    // Quota System Configuration
    quotaSettings: {
      type: 'string',
      default: JSON.stringify(STORED_CONFIG_DEFAULTS.quotaSettings),
    },
    // Approval System Configuration
    approvalExpiration: {
      type: 'string',
      default: JSON.stringify(STORED_CONFIG_DEFAULTS.approvalExpiration),
    },
    // Plex Label Sync Configuration - nested object following complex config pattern
    plexLabelSync: {
      type: 'string',
      default: JSON.stringify(STORED_CONFIG_DEFAULTS.plexLabelSync),
    },
  },
}

declare module 'fastify' {
  interface FastifyInstance {
    config: Config
    updateConfig(config: Partial<Config>): Promise<Config>
    updateConfigAndPersist(config: PublicConfigPatch): Promise<Config>
  }
}

export default fp(
  async (fastify: FastifyInstance) => {
    await fastify.register(env, {
      confKey: 'config',
      schema,
      dotenv: {
        path: dataDir ? resolve(dataDir, '.env') : './.env',
      },
      data: process.env,
    })

    const rawConfig = fastify.getEnvs<RawConfig>()

    const parsedConfig = {
      ...rawConfig,
      allowedOrigins: parseAllowedOrigins(rawConfig.allowedOrigins),
      allowedHosts: parseAllowedHosts(rawConfig.allowedHosts),
      sonarrTags: parseJsonOr(
        rawConfig.sonarrTags,
        [],
        fastify.log,
        'sonarrTags',
      ),
      radarrTags: parseJsonOr(
        rawConfig.radarrTags,
        [],
        fastify.log,
        'radarrTags',
      ),
      plexTokens: parseJsonOr(
        rawConfig.plexTokens,
        [],
        fastify.log,
        'plexTokens',
      ),
      plexSessionMonitoring: rawConfig.plexSessionMonitoring
        ? parseJsonOr(
            rawConfig.plexSessionMonitoring as string,
            PLEX_SESSION_MONITORING_DEFAULTS,
            fastify.log,
            'plexSessionMonitoring',
          )
        : undefined,
      publicContentNotifications: rawConfig.publicContentNotifications
        ? parseJsonOr(
            rawConfig.publicContentNotifications as string,
            DEFAULT_PUBLIC_CONTENT_NOTIFICATIONS,
            fastify.log,
            'publicContentNotifications',
          )
        : DEFAULT_PUBLIC_CONTENT_NOTIFICATIONS,
      quotaSettings: (() => {
        const parsed = rawConfig.quotaSettings
          ? parseJsonOr<{
              cleanup?: { enabled?: boolean; retentionDays?: number }
              weeklyRolling?: { resetDays?: number }
              monthly?: {
                resetDay?: number
                handleMonthEnd?: 'last-day' | 'skip-month' | 'next-month'
              }
            }>(
              rawConfig.quotaSettings as string,
              {},
              fastify.log,
              'quotaSettings',
            )
          : {}
        return {
          cleanup: {
            ...DEFAULT_QUOTA_SETTINGS.cleanup,
            ...(parsed.cleanup ?? {}),
          },
          weeklyRolling: {
            ...DEFAULT_QUOTA_SETTINGS.weeklyRolling,
            ...(parsed.weeklyRolling ?? {}),
          },
          monthly: {
            ...DEFAULT_QUOTA_SETTINGS.monthly,
            ...(parsed.monthly ?? {}),
          },
        }
      })(),
      approvalExpiration: rawConfig.approvalExpiration
        ? parseJsonOr(
            rawConfig.approvalExpiration as string,
            DEFAULT_APPROVAL_EXPIRATION,
            fastify.log,
            'approvalExpiration',
          )
        : DEFAULT_APPROVAL_EXPIRATION,
      plexLabelSync: (() => {
        const parsed = rawConfig.plexLabelSync
          ? parseJsonOr<Partial<PlexLabelSyncConfig>>(
              rawConfig.plexLabelSync as string,
              {},
              fastify.log,
              'plexLabelSync',
            )
          : {}
        return {
          ...PLEX_LABEL_SYNC_DEFAULTS,
          ...parsed,
          tagSync: {
            ...PLEX_LABEL_SYNC_DEFAULTS.tagSync,
            ...(parsed.tagSync ?? {}),
          },
        }
      })(),
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
      fastify.config = updatedConfig
      return updatedConfig
    })

    // updateConfig is a plain merge and cannot fail
    fastify.decorate(
      'updateConfigAndPersist',
      async (newConfig: PublicConfigPatch) => {
        const dbUpdated = await fastify.db.updateConfig(newConfig)
        if (!dbUpdated) {
          throw new Error('Failed to persist config update to database')
        }
        return fastify.updateConfig(newConfig)
      },
    )
  },
  {
    name: 'config',
  },
)
