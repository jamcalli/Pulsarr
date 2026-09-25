import { DeferredRoutingQueue } from '@services/deferred-routing-queue.service.js'
import { RssFeedCacheManager } from '@services/plex-watchlist/cache/rss-feed-cache.js'
import { updateAutoApprovalUserAttribution } from '../attribution/approval-attributor.js'
import {
  routeEnrichedItemsForUser,
  routeNewItemsForUser,
} from '../routing/item-router.js'
import type { WorkflowDeps } from '../types.js'
import { runPeriodicReconciliation } from './reconciliation-tick.js'
import {
  cleanupExistingManualSync,
  setupPeriodicReconciliation,
} from './scheduler.js'

export async function initializeWorkflow(deps: WorkflowDeps): Promise<void> {
  // stop() aborts this signal mid-start; nothing may be published after that
  const { signal } = deps.state

  try {
    deps.logger.debug('Cleaning up existing manual sync jobs')
    await cleanupExistingManualSync(deps)
  } catch (cleanupError) {
    deps.logger.warn(
      { error: cleanupError },
      'Error during cleanup of existing manual sync jobs (non-fatal)',
    )
  }

  try {
    deps.logger.debug('Verifying Plex connectivity')
    await deps.plexService.pingPlex()
    deps.logger.info('Plex connection verified')
  } catch (plexError) {
    deps.logger.error(
      { error: plexError },
      'Failed to verify Plex connectivity',
    )
    throw new Error('Failed to verify Plex connectivity', { cause: plexError })
  }
  if (signal.aborted) return

  try {
    deps.logger.debug('Generating RSS feeds')
    await deps.plexService.generateAndSaveRssFeeds()

    deps.logger.debug(
      'RSS feeds generated successfully, initializing monitoring',
    )
    deps.state.rssFeedCache = new RssFeedCacheManager(deps.logger)
    deps.state.isEtagFallbackActive = false
    deps.state.rssMode = true
  } catch (rssError) {
    deps.logger.warn(
      { error: rssError },
      'Failed to generate RSS feeds, falling back to manual sync',
    )
    deps.state.rssFeedCache = null
    deps.state.isEtagFallbackActive = true
    deps.state.rssMode = false
  }
  if (signal.aborted) return

  try {
    deps.logger.debug('Setting up periodic reconciliation job')
    await setupPeriodicReconciliation(
      (_jobName: string) => runPeriodicReconciliation(deps),
      deps,
    )
  } catch (reconciliationError) {
    deps.logger.warn(
      { error: reconciliationError },
      'Failed to setup periodic reconciliation',
    )
  }
  if (signal.aborted) {
    await cleanupExistingManualSync(deps)
    return
  }

  const deferredRoutingQueue = new DeferredRoutingQueue({
    sonarrManager: deps.sonarrManager,
    radarrManager: deps.radarrManager,
    callbacks: {
      routeEtagChange: (change) => routeNewItemsForUser(change, deps),
      routeItemsForUser: (userId, items) =>
        routeEnrichedItemsForUser(userId, items, deps),
      onDrained: () => {
        void updateAutoApprovalUserAttribution(deps)
        deps.state.scheduleDebouncedStatusSync(deps)
      },
    },
    signal: deps.state.signal,
    log: deps.logger,
  })
  deps.state.deferredRoutingQueue?.stop()
  deps.state.deferredRoutingQueue = deferredRoutingQueue
  deferredRoutingQueue.start()
}
