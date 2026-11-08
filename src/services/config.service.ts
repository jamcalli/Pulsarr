import type {
  ArrWebhookResults,
  ConfigFull,
  ConfigUpdate,
} from '@root/schemas/config/config.schema.js'
import type { ConfigUpdateResult } from '@root/types/config.types.js'
import {
  hasCallbackFailure,
  registerArrWebhooks,
  testArrWebhookAddress,
} from '@services/arr-webhook-address.service.js'
import { PlexTokenCheckError } from '@services/plex-watchlist/api/token-check.js'
import {
  plexTokensChanged,
  withFeedsResetOnTokenChange,
} from '@services/plex-watchlist/rss/token-feeds.js'
import { TagNamingBlockedError } from '@services/user-tags/types.js'
import { createServiceLogger } from '@utils/logger.js'
import type { FastifyBaseLogger, FastifyInstance } from 'fastify'

export class ConfigService {
  private readonly log: FastifyBaseLogger

  constructor(
    readonly baseLog: FastifyBaseLogger,
    private readonly fastify: FastifyInstance,
  ) {
    this.log = createServiceLogger(baseLog, 'CONFIG')
  }

  async get(): Promise<ConfigFull | null> {
    const config = await this.fastify.db.getConfig()
    return config ? this.withRuntimeApprise(config) : null
  }

  async update(patch: ConfigUpdate): Promise<ConfigUpdateResult> {
    const { fastify } = this

    if (
      patch.plexMobileEnabled === true &&
      !fastify.plexServerService.getHasPlexPass()
    ) {
      return {
        success: false,
        reason: 'plex_pass_required',
        message:
          'Plex Pass is required for Plex mobile notifications. Please ensure your Plex account has an active Plex Pass subscription.',
      }
    }

    const currentConfig = await fastify.db.getConfig()
    const currentTokens = currentConfig?.plexTokens ?? []

    try {
      await fastify.userTags.assertPrefixChangeAllowed(patch)
    } catch (error) {
      if (error instanceof TagNamingBlockedError) {
        return {
          success: false,
          reason: 'tag_prefix_blocked',
          message: error.message,
        }
      }
      throw error
    }

    try {
      await fastify.plexWatchlist.assertTokensAccepted(patch, currentTokens)
    } catch (error) {
      if (error instanceof PlexTokenCheckError) {
        return {
          success: false,
          reason:
            error.result === 'rejected'
              ? 'token_rejected'
              : 'token_unreachable',
          message: error.message,
        }
      }
      throw error
    }

    // The stored baseUrl can be unset while the env default is live, so compare against the runtime config
    const candidate = {
      baseUrl: patch.baseUrl ?? fastify.config.baseUrl,
      port: patch.port ?? fastify.config.port,
    }
    const addressChanged =
      candidate.baseUrl !== fastify.config.baseUrl ||
      candidate.port !== fastify.config.port
    if (addressChanged) {
      const webhooks = await testArrWebhookAddress(fastify, candidate)
      // Only a rejected callback blocks the save because a down arr keeps its hook and re-registers at startup
      if (hasCallbackFailure(webhooks)) {
        return {
          success: false,
          reason: 'webhook_unreachable',
          message:
            'Radarr or Sonarr could not reach Pulsarr at the new address',
          webhooks,
        }
      }
    }

    await fastify.updateConfigAndPersist(
      withFeedsResetOnTokenChange(patch, currentTokens),
    )

    const savedConfig = await fastify.db.getConfig()
    if (!savedConfig) {
      throw new Error('Configuration unexpectedly missing after update')
    }

    let webhooks: ArrWebhookResults | undefined
    if (addressChanged) {
      try {
        webhooks = await registerArrWebhooks(fastify)
      } catch (error) {
        this.log.error({ error }, 'Failed to re-register arr webhooks')
      }
    }

    if (
      'logLevel' in patch &&
      savedConfig.logLevel &&
      fastify.log.level !== savedConfig.logLevel
    ) {
      this.log.info(`Updating runtime log level to: ${savedConfig.logLevel}`)
      fastify.log.level = savedConfig.logLevel
    }

    if ('plexMobileEnabled' in patch) {
      if (patch.plexMobileEnabled === true) {
        try {
          await fastify.notifications.plexMobile.initialize()
        } catch (error) {
          this.log.error(
            { error },
            'Failed to initialize Plex Mobile after enabling',
          )
        }
      } else {
        fastify.notifications.plexMobile.shutdown()
      }
    }

    if ('plexServerUrl' in patch || 'plexTokens' in patch) {
      try {
        await fastify.plexServerService.applyConnectionSettings(
          plexTokensChanged(patch, currentTokens),
        )
      } catch (error) {
        this.log.error({ error }, 'Failed to apply Plex connection settings')
      }
    }

    if ('tmdbRegion' in patch) {
      fastify.tmdb.applyRegionChange()
    }

    if ('maintainerrEnabled' in patch || 'maintainerrUrl' in patch) {
      void fastify.maintainerr
        .applyConfigChange(currentConfig?.maintainerrUrl)
        .catch((error) => {
          this.log.error({ error }, 'Failed to apply Maintainerr config change')
        })
    }

    try {
      fastify.notifications.emitStatusEvents()
    } catch (error) {
      this.log.error(
        { error },
        'Failed to emit status events after config update',
      )
    }

    return {
      success: true,
      config: this.withRuntimeApprise(savedConfig),
      webhooks,
    }
  }

  private withRuntimeApprise(config: ConfigFull): ConfigFull {
    return {
      ...config,
      enableApprise: this.fastify.config.enableApprise,
      appriseUrl: this.fastify.config.appriseUrl,
    }
  }
}
