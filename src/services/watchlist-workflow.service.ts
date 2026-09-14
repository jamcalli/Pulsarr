import type { ProgressEvent } from '@root/types/progress.types.js'
import { handleLinkedItemsForLabelSync } from '@services/plex-watchlist/index.js'
import { createServiceLogger } from '@utils/logger.js'
import { systemStatusEvent } from '@utils/system-status-event.js'
import type { FastifyBaseLogger, FastifyInstance } from 'fastify'
import {
  getEtagFriendsList,
  startStaggeredPolling,
} from './watchlist-workflow/etag/staggered-poller.js'
import { fetchWatchlists as fetchWatchlistsModule } from './watchlist-workflow/fetching/watchlist-fetcher.js'
import { schedulePendingReconciliation } from './watchlist-workflow/lifecycle/scheduler.js'
import { initializeWorkflow } from './watchlist-workflow/lifecycle/workflow-starter.js'
import { cleanupWorkflow } from './watchlist-workflow/lifecycle/workflow-stopper.js'
import { reconcile as reconcileModule } from './watchlist-workflow/orchestration/reconciler.js'
import { checkRssFeeds } from './watchlist-workflow/rss/feed-poller.js'
import {
  WorkflowState,
  type WorkflowStatus,
} from './watchlist-workflow/state.js'
import type { WorkflowDeps } from './watchlist-workflow/types.js'

export class WatchlistWorkflowService {
  // Inherits parent log level changes
  private readonly log: FastifyBaseLogger

  private readonly state = new WorkflowState()

  constructor(
    readonly baseLog: FastifyBaseLogger,
    private readonly fastify: FastifyInstance,
    // RSS check interval: 10s with small jitter (S3 feeds update within seconds)
    private readonly rssCheckIntervalMs: number = 10_000 +
      Math.ceil(Math.random() * 2_000),
  ) {
    this.log = createServiceLogger(baseLog, 'WATCHLIST_WORKFLOW')
    this.log.info('Initializing Watchlist Workflow Service')
  }

  // Rebuilt per access: fastify.config is reassigned by updateConfig at runtime
  private get deps(): WorkflowDeps {
    const { fastify, log: logger } = this
    const { db, config, plexLabelSyncService } = fastify

    return {
      logger,
      config,
      db,
      fastify,
      state: this.state,
      plexService: fastify.plexWatchlist,
      contentRouter: fastify.contentRouter,
      sonarrManager: fastify.sonarrManager,
      radarrManager: fastify.radarrManager,
      plexServerService: fastify.plexServerService,
      notifications: fastify.notifications,
      statusService: fastify.sync,
      plexLabelSyncService,
      itemProcessorDeps: {
        db,
        logger,
        config,
        fastify,
        plexLabelSyncService,
        handleLinkedItemsForLabelSync: (linkItems) =>
          handleLinkedItemsForLabelSync(linkItems, {
            db,
            logger,
            plexLabelSyncService,
          }),
      },
    }
  }

  getStatus(): WorkflowStatus {
    return this.state.status
  }

  statusEvent(): ProgressEvent {
    return systemStatusEvent(
      'watchlist-workflow-status',
      'Watchlist workflow status',
      {
        status: this.state.status,
        syncMode: this.state.isEtagFallbackActive ? 'polling' : 'rss',
        rssAvailable: !this.state.isEtagFallbackActive,
      },
    )
  }

  // intermediate starting/stopping states must reach the stream, not just final states
  private setStatus(status: WorkflowStatus): void {
    this.state.status = status
    if (this.fastify.progress.hasActiveConnections()) {
      this.fastify.progress.emit(this.statusEvent())
    }
  }

  public getIsUsingRssFallback(): boolean {
    return this.state.isEtagFallbackActive
  }

  public getLastSuccessfulSyncTime(): number {
    return this.state.lastSuccessfulSyncTime
  }

  isInitialized(): boolean {
    return this.state.initialized
  }

  isRssMode(): boolean {
    return this.state.rssMode
  }

  async startWorkflow(): Promise<boolean> {
    try {
      this.state.beginRun()
      this.setStatus('starting')
      this.log.debug('Starting watchlist workflow initialization')

      await initializeWorkflow(this.deps)

      // Baselines come before reconciliation so items added mid-sync are caught on the first poll
      if (this.state.rssMode && this.state.rssFeedCache) {
        const token = this.fastify.config.plexTokens?.[0]
        if (token) {
          this.log.debug('Priming RSS caches before reconciliation')
          await this.state.rssFeedCache.primeCaches(
            this.fastify.config.selfRss,
            this.fastify.config.friendsRss,
            token,
          )
        }
      } else if (!this.state.rssMode) {
        this.log.debug('Establishing ETag baselines before reconciliation')
        const etagPoller = this.state.ensureEtagPoller(
          this.fastify.config,
          this.log,
        )
        const primaryUser = await this.fastify.db.getPrimaryUser()
        if (primaryUser) {
          const friends = await getEtagFriendsList(this.deps)
          await etagPoller.establishAllBaselines(primaryUser.id, friends)
        }
      }

      try {
        this.log.debug('Starting initial full reconciliation')
        await this.reconcile({ mode: 'full' })
        await schedulePendingReconciliation(this.deps)
      } catch (syncError) {
        this.log.error(
          { error: syncError },
          'Error during initial reconciliation',
        )
        try {
          await schedulePendingReconciliation(this.deps)
        } catch (scheduleError) {
          this.log.error(
            { error: scheduleError },
            'Failed to schedule failsafe after initial sync error',
          )
        }
        throw new Error('Failed during initial reconciliation', {
          cause: syncError,
        })
      }

      if (this.state.rssMode) {
        if (this.state.rssCheckInterval) {
          clearInterval(this.state.rssCheckInterval)
        }
        this.state.rssCheckInterval = setInterval(
          () => void checkRssFeeds(this.deps),
          this.rssCheckIntervalMs,
        )
      } else {
        this.log.debug('Starting ETag staggered polling')
        await startStaggeredPolling(this.deps)
      }

      this.setStatus('running')
      this.state.initialized = true

      if (this.state.isEtagFallbackActive) {
        this.log.info(
          'Watchlist workflow running in ETag mode (5-minute staggered polling, 2-hour full reconciliation)',
        )
      } else {
        this.log.info(
          'Watchlist workflow running in RSS mode (instant detection, 2-hour full reconciliation)',
        )
      }

      return true
    } catch (error) {
      this.log.error({ error }, 'Error in Watchlist workflow')
      try {
        await cleanupWorkflow(this.deps)
      } catch (cleanupError) {
        this.log.error(
          { error: cleanupError },
          'Error cleaning up after failed workflow start',
        )
      }
      this.setStatus('stopped')
      this.state.initialized = false
      this.state.rssMode = false
      throw error
    }
  }

  async stop(): Promise<boolean> {
    if (this.state.status !== 'running' && this.state.status !== 'starting') {
      this.log.warn(
        `Cannot stop workflow: current status is ${this.state.status}`,
      )
      return false
    }

    this.log.info('Stopping Watchlist workflow')
    this.setStatus('stopping')

    await cleanupWorkflow(this.deps)

    this.setStatus('stopped')
    this.state.initialized = false
    this.state.rssMode = false

    return true
  }

  async reconcile(options: { mode: 'full' | 'etag' }): Promise<void> {
    return reconcileModule(options, this.deps)
  }

  async fetchWatchlists(): Promise<void> {
    return fetchWatchlistsModule(this.deps)
  }
}
