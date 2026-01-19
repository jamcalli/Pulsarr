/**
 * Mode Switcher Module
 *
 * Handles detection of RSS cache settings and hot-swapping between
 * RSS mode and ETag mode based on Plex CDN cache configuration.
 */

import type { Config } from '@root/types/config.types.js'
import type { EtagUserInfo } from '@root/types/plex.types.js'
import {
  detectRssCacheSettings,
  EtagPoller,
  type RssCacheInfo,
  RssFeedCacheManager,
} from '@services/plex-watchlist/index.js'
import type { FastifyBaseLogger } from 'fastify'

/** Dependencies for mode switching operations */
export interface ModeSwitcherDeps {
  log: FastifyBaseLogger
  config: Config
  getPrimaryUser: () => Promise<{ id: number } | null | undefined>
  getEtagFriendsList: () => Promise<EtagUserInfo[]>
}

/** Mutable state managed by the workflow service */
export interface ModeSwitcherState {
  rssMode: boolean
  isEtagFallbackActive: boolean
  rssCacheDisabled: boolean
  lastRssCacheInfo: RssCacheInfo | null
  rssCheckInterval: NodeJS.Timeout | null
  etagPoller: EtagPoller | null
  rssFeedCache: RssFeedCacheManager | null
}

/** Callbacks for starting/stopping polling modes */
export interface ModeSwitcherCallbacks {
  startRssCheck: () => void
  startEtagCheckInterval: () => void
}

/** State updates to apply after mode switch */
export interface ModeStateUpdate {
  rssMode: boolean
  isEtagFallbackActive: boolean
  rssCacheDisabled: boolean
}

/** Result of checking RSS cache and potentially switching modes */
export interface ModeCheckResult {
  switched: boolean
  newMode: 'RSS' | 'ETag' | null
  cacheInfo: RssCacheInfo
  /** State updates to apply - only present if switched is true */
  stateUpdate?: ModeStateUpdate
}

/**
 * Check RSS cache settings on startup and determine initial mode.
 * Returns updated state flags if cache is too aggressive.
 */
export async function checkInitialRssCacheMode(
  selfRss: string | undefined,
  log: FastifyBaseLogger,
): Promise<{
  cacheInfo: RssCacheInfo | null
  shouldDisableRss: boolean
}> {
  if (!selfRss) {
    return { cacheInfo: null, shouldDisableRss: false }
  }

  const cacheInfo = await detectRssCacheSettings(selfRss, log)

  if (cacheInfo.isCacheTooAggressive) {
    log.warn(
      { sMaxAge: cacheInfo.sMaxAge, description: cacheInfo.description },
      'RSS CDN cache too aggressive on startup, using ETag mode instead',
    )
  } else {
    log.info(
      { sMaxAge: cacheInfo.sMaxAge, description: cacheInfo.description },
      'RSS CDN cache acceptable, using RSS mode',
    )
  }

  return { cacheInfo, shouldDisableRss: cacheInfo.isCacheTooAggressive }
}

/**
 * Check RSS cache settings and switch modes if needed.
 * Called during periodic reconciliation.
 */
export async function checkAndSwitchModeIfNeeded(
  deps: ModeSwitcherDeps,
  state: ModeSwitcherState,
  callbacks: ModeSwitcherCallbacks,
): Promise<ModeCheckResult> {
  const { log, config } = deps
  const selfRss = config.selfRss

  if (!selfRss) {
    return {
      switched: false,
      newMode: null,
      cacheInfo: {
        sMaxAge: null,
        isCacheTooAggressive: false,
        description: 'No RSS URL configured',
      },
    }
  }

  const cacheInfo = await detectRssCacheSettings(selfRss, log)

  log.info(
    {
      sMaxAge: cacheInfo.sMaxAge,
      isCacheTooAggressive: cacheInfo.isCacheTooAggressive,
      currentMode: state.rssMode ? 'RSS' : 'ETag',
    },
    `RSS cache check: ${cacheInfo.description}`,
  )

  const shouldDisableRss = cacheInfo.isCacheTooAggressive

  // Case 1: Cache became too aggressive - switch RSS → ETag
  if (shouldDisableRss && !state.rssCacheDisabled && state.rssMode) {
    log.warn(
      { sMaxAge: cacheInfo.sMaxAge },
      'RSS CDN cache too aggressive, switching to ETag mode',
    )
    const stateUpdate = await switchToEtagMode(deps, state, callbacks)
    return { switched: true, newMode: 'ETag', cacheInfo, stateUpdate }
  }

  // Case 2: Cache is now acceptable - switch ETag → RSS
  if (!shouldDisableRss && state.rssCacheDisabled && !state.rssMode) {
    log.info(
      { sMaxAge: cacheInfo.sMaxAge },
      'RSS CDN cache now acceptable, switching to RSS mode',
    )
    const stateUpdate = await switchToRssMode(deps, state, callbacks)
    return { switched: true, newMode: 'RSS', cacheInfo, stateUpdate }
  }

  return { switched: false, newMode: null, cacheInfo }
}

/**
 * Switch from RSS mode to ETag mode.
 *
 * Note: This function uses a hybrid state mutation approach:
 * - Object references (timers, pollers, caches) are mutated directly since
 *   they're passed by reference and need immediate cleanup/initialization
 * - Boolean flags (rssMode, etc.) are returned for the caller to apply since
 *   primitives are passed by value and mutations wouldn't propagate
 */
async function switchToEtagMode(
  deps: ModeSwitcherDeps,
  state: ModeSwitcherState,
  callbacks: ModeSwitcherCallbacks,
): Promise<ModeStateUpdate> {
  const { log, config } = deps

  // Stop RSS polling
  if (state.rssCheckInterval) {
    clearInterval(state.rssCheckInterval)
    state.rssCheckInterval = null
  }

  // Clear RSS caches
  if (state.rssFeedCache) {
    state.rssFeedCache.clearCaches()
  }

  // Initialize ETag poller if needed
  if (!state.etagPoller) {
    state.etagPoller = new EtagPoller(config, log)
  }

  // Establish ETag baselines (best-effort - don't block mode switch on failure)
  const primaryUser = await deps.getPrimaryUser()
  if (primaryUser) {
    try {
      const friends = await deps.getEtagFriendsList()
      await state.etagPoller.establishAllBaselines(primaryUser.id, friends)
    } catch (error) {
      log.warn(
        { error: error instanceof Error ? error.message : String(error) },
        'Failed to establish ETag baselines, will retry on next poll',
      )
    }
  }

  // Start ETag polling
  callbacks.startEtagCheckInterval()

  log.info('Mode switch complete: now running in ETag mode')

  return { rssMode: false, isEtagFallbackActive: true, rssCacheDisabled: true }
}

/**
 * Switch from ETag mode to RSS mode.
 * Returns state updates for the caller to apply.
 */
async function switchToRssMode(
  deps: ModeSwitcherDeps,
  state: ModeSwitcherState,
  callbacks: ModeSwitcherCallbacks,
): Promise<ModeStateUpdate> {
  const { log, config } = deps

  // Stop ETag staggered polling
  if (state.etagPoller?.isStaggeredPolling()) {
    state.etagPoller.stopStaggeredPolling()
  }

  // Initialize RSS feed cache if needed (for stable key diffing)
  if (!state.rssFeedCache) {
    state.rssFeedCache = new RssFeedCacheManager(log)
  }

  // Prime RSS caches (best-effort - don't block mode switch on failure)
  const token = config.plexTokens?.[0]
  if (token && state.rssFeedCache) {
    try {
      await state.rssFeedCache.primeCaches(
        config.selfRss,
        config.friendsRss,
        token,
      )
    } catch (error) {
      log.warn(
        { error: error instanceof Error ? error.message : String(error) },
        'Failed to prime RSS caches, will retry on next poll',
      )
    }
  }

  // Start RSS polling
  callbacks.startRssCheck()

  log.info('Mode switch complete: now running in RSS mode')

  return { rssMode: true, isEtagFallbackActive: false, rssCacheDisabled: false }
}
