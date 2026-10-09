/**
 * RSS Safety Net
 *
 * Plex's friends RSS feed occasionally drops an add. In RSS mode that item would
 * otherwise wait for the 2-hour full reconciliation. The safety net reuses the
 * ETag staggered poller to check one user at a time with the cheapest request
 * the poller has (a conditional first-page request for the primary user, a
 * 2-item GraphQL query for friends), spread evenly and jittered across a long
 * cycle (30 minutes by default, never under 10).
 *
 * Baselines come from the full reconciliation, which already refreshes them
 * every run, and the friend list comes from the UUID cache, so the safety net
 * adds no friend-list or watchlist-page requests of its own.
 */

import {
  RSS_SAFETY_NET_DEFAULT_MINUTES,
  RSS_SAFETY_NET_MAX_MINUTES,
  RSS_SAFETY_NET_MIN_MINUTES,
} from '@root/schemas/config/config.schema.js'
import type { Config } from '@root/types/config.types.js'
import type { EtagPollResult, EtagUserInfo } from '@root/types/plex.types.js'
import { buildEtagUserInfoFromMap } from '../etag/helpers.js'
import { routePolledItems } from '../etag/staggered-poller.js'
import type { WorkflowDeps } from '../types.js'

/** How long a safety-net check waits for an in-flight RSS check before giving up its slot */
const RSS_CHECK_WAIT_MAX_MS = 30_000
const RSS_CHECK_WAIT_STEP_MS = 250

export function getSafetyNetCycleMs(
  config: Pick<Config, 'rssSafetyNetIntervalMinutes'>,
): number {
  const requested =
    config.rssSafetyNetIntervalMinutes ?? RSS_SAFETY_NET_DEFAULT_MINUTES
  const minutes = Number.isFinite(requested)
    ? Math.min(
        RSS_SAFETY_NET_MAX_MINUTES,
        Math.max(RSS_SAFETY_NET_MIN_MINUTES, requested),
      )
    : RSS_SAFETY_NET_DEFAULT_MINUTES
  return minutes * 60 * 1000
}

/**
 * Routes items the safety net found through the same path as ETag mode.
 * Items RSS already delivered are already linked to the user in the DB, so
 * only the adds RSS missed come back from routePolledItems.
 */
export async function handleSafetyNetPollResult(
  result: EtagPollResult,
  deps: WorkflowDeps,
): Promise<void> {
  if (!result.changed || result.newItems.length === 0) return
  if (deps.state.signal.aborted) return

  const user = await deps.db.getUser(result.userId)
  if (!user) {
    deps.logger.warn(
      { userId: result.userId },
      'User not found for RSS safety-net result',
    )
    return
  }

  const caught = await routePolledItems(result, user.name, deps)

  if (caught.length > 0) {
    deps.logger.info(
      {
        userId: result.userId,
        username: user.name,
        caught: caught.length,
        titles: caught.map((item) => item.title),
      },
      'RSS safety net caught watchlist items the RSS feed missed',
    )
  } else {
    deps.logger.debug(
      { userId: result.userId, newItems: result.newItems.length },
      'RSS safety net found no items the RSS feed missed',
    )
  }
}

/**
 * Gate around each safety-net check. Skips the check while a full
 * reconciliation holds the lock, and holds the lock itself while checking so a
 * reconciliation waits rather than overlapping. RSS ticks and safety-net checks
 * exclude each other so one add cannot be routed by both.
 */
export function createSafetyNetGate(
  deps: Pick<WorkflowDeps, 'state' | 'logger' | 'config'>,
): (check: () => Promise<void>) => Promise<void> {
  return async (check) => {
    const { state } = deps
    const { signal } = state

    if (signal.aborted || !deps.config.rssSafetyNetEnabled) return
    if (state.isReconciling) {
      deps.logger.debug(
        'Reconciliation in progress, skipping RSS safety-net check',
      )
      return
    }

    const deadline = Date.now() + RSS_CHECK_WAIT_MAX_MS
    while (state.rssChecksInFlight > 0) {
      if (signal.aborted) return
      if (Date.now() >= deadline) {
        deps.logger.debug(
          'RSS check still running, skipping RSS safety-net check',
        )
        return
      }
      await new Promise((resolve) =>
        setTimeout(resolve, RSS_CHECK_WAIT_STEP_MS),
      )
    }

    // A reconciliation may have started while this check waited
    if (signal.aborted || state.isReconciling) return

    state.isReconciling = true
    state.isSafetyNetChecking = true
    try {
      await check()
    } finally {
      state.isSafetyNetChecking = false
      state.isReconciling = false
    }
  }
}

function safetyNetUsers(deps: Pick<WorkflowDeps, 'state'>): EtagUserInfo[] {
  return buildEtagUserInfoFromMap(deps.state.plexUuidCache)
}

/** Arms the safety net when the workflow is in RSS mode and the setting is on; a no-op otherwise. */
export async function startRssSafetyNet(deps: WorkflowDeps): Promise<boolean> {
  const { state } = deps
  const { signal } = state

  if (state.isSafetyNetActive) return true
  if (!state.rssMode || signal.aborted || !deps.config.rssSafetyNetEnabled) {
    return false
  }

  const primaryUser = await deps.db.getPrimaryUser()
  if (signal.aborted || state.isSafetyNetActive) return state.isSafetyNetActive
  if (!primaryUser) {
    deps.logger.warn('No primary user found, cannot start RSS safety net')
    return false
  }
  if (!deps.config.rssSafetyNetEnabled) return false

  const etagPoller = state.ensureEtagPoller(() => deps.config, deps.logger)
  etagPoller.startStaggeredPolling(
    primaryUser.id,
    safetyNetUsers(deps),
    (result) => handleSafetyNetPollResult(result, deps),
    async () => safetyNetUsers(deps),
    {
      getCycleMs: () => getSafetyNetCycleMs(deps.config),
      runCheck: createSafetyNetGate(deps),
      label: 'RSS safety-net',
    },
  )
  state.isSafetyNetActive = true
  return true
}

export function stopRssSafetyNet(
  deps: Pick<WorkflowDeps, 'state' | 'logger'>,
): void {
  const { state } = deps
  if (!state.isSafetyNetActive) return

  state.etagPoller?.stopStaggeredPolling()
  state.isSafetyNetActive = false
  deps.logger.info('RSS safety net stopped')
}

/** Applies a config change: starts or stops the safety net to match the setting. */
export async function syncRssSafetyNet(deps: WorkflowDeps): Promise<void> {
  if (
    deps.state.status === 'running' &&
    deps.state.rssMode &&
    deps.config.rssSafetyNetEnabled
  ) {
    await startRssSafetyNet(deps)
  } else {
    stopRssSafetyNet(deps)
  }
}
