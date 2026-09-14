import type { Config } from '@root/types/config.types.js'
import type { UserMapEntry } from '@root/types/plex.types.js'
import type { DeferredRoutingQueue } from '@services/deferred-routing-queue.service.js'
import type { RssFeedCacheManager } from '@services/plex-watchlist/cache/rss-feed-cache.js'
import { EtagPoller } from '@services/plex-watchlist/etag/etag-poller.js'
import type { FastifyBaseLogger } from 'fastify'
import {
  updatePlexUuidCache as buildPlexUuidCache,
  lookupUserByUuid as lookupUserByUuidInCache,
} from './cache/uuid-cache.js'
import type { WorkflowDeps } from './types.js'

const STATUS_SYNC_DEBOUNCE_MS = 60 * 1000

export type WorkflowStatus = 'stopped' | 'running' | 'starting' | 'stopping'

export class WorkflowState {
  status: WorkflowStatus = 'stopped'
  initialized = false
  rssMode = false
  isEtagFallbackActive = false
  isReconciling = false
  lastSuccessfulSyncTime = Date.now()
  etagPoller: EtagPoller | null = null
  rssFeedCache: RssFeedCacheManager | null = null
  deferredRoutingQueue: DeferredRoutingQueue | null = null
  plexUuidCache: Map<string, UserMapEntry> = new Map()
  rssCheckInterval: NodeJS.Timeout | null = null
  statusSyncDebounceTimer: NodeJS.Timeout | null = null

  ensureEtagPoller(config: Config, logger: FastifyBaseLogger): EtagPoller {
    if (!this.etagPoller) {
      this.etagPoller = new EtagPoller(config, logger)
    }
    return this.etagPoller
  }

  updatePlexUuidCache(
    userMap: Map<string, UserMapEntry>,
    logger: FastifyBaseLogger,
  ): void {
    this.plexUuidCache = buildPlexUuidCache(userMap, logger)
  }

  async lookupUserByUuid(
    uuid: string,
    deps: Pick<WorkflowDeps, 'logger' | 'plexService'>,
  ): Promise<number | null> {
    const result = await lookupUserByUuidInCache(uuid, this.plexUuidCache, deps)
    this.plexUuidCache = result.cache
    return result.userId
  }

  scheduleDebouncedStatusSync(
    deps: Pick<WorkflowDeps, 'logger' | 'statusService'>,
  ): void {
    if (this.statusSyncDebounceTimer) {
      clearTimeout(this.statusSyncDebounceTimer)
      deps.logger.debug('Reset status sync debounce timer')
    }

    this.statusSyncDebounceTimer = setTimeout(async () => {
      this.statusSyncDebounceTimer = null
      try {
        deps.logger.debug('Debounced status sync triggered')
        const { shows: showUpdates, movies: movieUpdates } =
          await deps.statusService.syncAllStatuses()
        deps.logger.info(
          `Status sync completed: ${showUpdates} show updates, ${movieUpdates} movie updates`,
        )
      } catch (error) {
        deps.logger.warn(
          { error },
          'Error in debounced status sync (non-fatal)',
        )
      }
    }, STATUS_SYNC_DEBOUNCE_MS)

    deps.logger.debug(
      { delayMs: STATUS_SYNC_DEBOUNCE_MS },
      'Scheduled debounced status sync',
    )
  }
}
