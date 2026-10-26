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
    const ping = await deps.plexService.pingPlex()
    if (ping === 'accepted') {
      deps.logger.debug('Plex connection verified')
    } else if (ping === 'rejected') {
      deps.logger.warn(
        'Plex rejected the linked token. Relink the Plex account to resume syncing.',
      )
    } else {
      deps.logger.warn(
        'Plex could not be reached, starting anyway so syncing resumes once Plex answers',
      )
    }
  } catch (plexError) {
    deps.logger.error(
      { error: plexError },
      'Failed to verify Plex connectivity',
    )
    throw new Error('Failed to verify Plex connectivity', { cause: plexError })
  }
  if (signal.aborted) return

  let rssReady = false
  try {
    deps.logger.debug('Generating RSS feeds')
    await deps.plexService.generateAndSaveRssFeeds()
    rssReady = true
  } catch (rssError) {
    deps.logger.warn(
      { error: rssError },
      'Failed to generate RSS feeds, falling back to manual sync',
    )
  }
  if (signal.aborted) return

  deps.state.rssFeedCache = rssReady
    ? new RssFeedCacheManager(deps.logger)
    : null
  deps.state.isEtagFallbackActive = !rssReady
  deps.state.rssMode = rssReady

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
