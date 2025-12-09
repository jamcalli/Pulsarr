/**
 * Unified Item Processor
 *
 * Provides a shared processing flow for all change detection paths
 * (full sync, ETag, RSS). Efficiently categorizes items and uses
 * the appropriate processing path for each:
 * - Brand new items: enrich → save → return for routing
 * - Existing items: link to user (skip enrichment) → return for routing
 *
 * IMPORTANT: Both brand new AND linked items need routing because each user
 * may have different router rules pointing to different instances. The caller
 * is responsible for routing ALL returned items.
 */

import type { Config } from '@root/types/config.types.js'
import type {
  Friend,
  TokenWatchlistItem,
  Item as WatchlistItem,
} from '@root/types/plex.types.js'
import type { DatabaseService } from '@services/database.service.js'
import type { FastifyBaseLogger, FastifyInstance } from 'fastify'
import type { PlexLabelSyncService } from '../../plex-label-sync.service.js'
import { categorizeItems } from '../sync/item-categorizer.js'
import {
  type ItemProcessorDeps,
  linkExistingItems,
  processAndSaveNewItems,
} from './item-processor.js'

/**
 * Input for unified item processing
 */
export interface ProcessItemsInput {
  /** The user these items are for */
  user: Friend
  /** Items to process - must have key/id field */
  items: TokenWatchlistItem[]
  /** Whether this is the self watchlist (primary user) vs friends */
  isSelfWatchlist: boolean
}

/**
 * Result of unified item processing
 */
export interface ProcessItemsResult {
  /** Number of brand new items that were enriched and saved */
  brandNewCount: number
  /** Number of existing items that were linked to the user */
  linkedCount: number
  /** The processed brand new items (ready for routing) */
  processedItems: WatchlistItem[]
  /** Existing items linked to user (also need routing for user-specific target instances) */
  linkedItems: WatchlistItem[]
}

/**
 * Dependencies for unified processing
 */
export interface UnifiedProcessorDeps {
  db: DatabaseService
  logger: FastifyBaseLogger
  config: Config
  fastify: FastifyInstance
  plexLabelSyncService?: PlexLabelSyncService
  handleLinkedItemsForLabelSync: (linkItems: WatchlistItem[]) => Promise<void>
}

/**
 * Builds ItemProcessorDeps from UnifiedProcessorDeps
 */
function buildItemProcessorDeps(deps: UnifiedProcessorDeps): ItemProcessorDeps {
  return {
    db: deps.db,
    logger: deps.logger,
    config: deps.config,
    fastify: deps.fastify,
    plexLabelSyncService: deps.plexLabelSyncService,
    handleLinkedItemsForLabelSync: deps.handleLinkedItemsForLabelSync,
  }
}

/**
 * Unified item processing for all change detection paths.
 *
 * This function efficiently categorizes items and uses the appropriate
 * processing path for each:
 * - Brand new items: enriched via TMDB/TVDB, saved to DB
 * - Existing items: linked to user without enrichment
 *
 * @param input - The items to process and their context
 * @param deps - Service dependencies
 * @returns Processing result with counts and processed items
 */
export async function processItemsForUser(
  input: ProcessItemsInput,
  deps: UnifiedProcessorDeps,
): Promise<ProcessItemsResult> {
  const { user, items, isSelfWatchlist } = input
  const { db, logger } = deps

  if (items.length === 0) {
    return {
      brandNewCount: 0,
      linkedCount: 0,
      processedItems: [],
      linkedItems: [],
    }
  }

  logger.debug(
    { userId: user.userId, username: user.username, itemCount: items.length },
    'Processing items via unified flow',
  )

  // Step 1: Get all keys from items for DB lookup
  const allKeys = items.map((item) => item.key || item.id).filter(Boolean)

  if (allKeys.length === 0) {
    logger.warn(
      { userId: user.userId },
      'No valid keys found in items, skipping',
    )
    return {
      brandNewCount: 0,
      linkedCount: 0,
      processedItems: [],
      linkedItems: [],
    }
  }

  // Step 2: Look up existing items in DB by keys
  const existingItems = await db.getWatchlistItemsByKeys(allKeys)

  // Step 3: Build user watchlist map for categorization
  const userWatchlistMap = new Map<
    Friend & { userId: number },
    Set<TokenWatchlistItem>
  >()
  userWatchlistMap.set(user, new Set(items))

  // Step 4: Categorize into brand new vs existing
  const { brandNewItems, existingItemsToLink } = categorizeItems(
    userWatchlistMap,
    existingItems,
    { logger },
    false, // forceRefresh
  )

  // Step 5: Process brand new items (enrich → save)
  // Note: This does NOT route - caller is responsible for routing
  const processedItems: WatchlistItem[] = []
  const brandNewCount = brandNewItems.get(user)?.size ?? 0

  if (brandNewCount > 0) {
    logger.debug(
      { userId: user.userId, count: brandNewCount },
      'Processing brand new items',
    )

    const processedMap = await processAndSaveNewItems(
      brandNewItems,
      isSelfWatchlist,
      false, // isMetadataRefresh
      buildItemProcessorDeps(deps),
    )

    // Extract processed items for return
    for (const itemSet of processedMap.values()) {
      processedItems.push(...itemSet)
    }
  }

  // Step 6: Link existing items (just create user junction, no enrichment)
  // These items still need routing - they may route to different instances for this user
  let linkedItems: WatchlistItem[] = []
  const linkedItemsSet = existingItemsToLink.get(user)
  const linkedCount = linkedItemsSet?.size ?? 0

  if (linkedCount > 0) {
    logger.debug(
      { userId: user.userId, count: linkedCount },
      'Linking existing items to user',
    )

    await linkExistingItems(existingItemsToLink, {
      db,
      logger,
      handleLinkedItemsForLabelSync: deps.handleLinkedItemsForLabelSync,
    })

    // Collect linked items for return - caller needs to route these too
    linkedItems = Array.from(linkedItemsSet ?? [])
  }

  logger.info(
    {
      userId: user.userId,
      username: user.username,
      brandNew: brandNewCount,
      linked: linkedCount,
    },
    'Items processed via unified flow',
  )

  // Return BOTH brand new AND linked items
  // Caller is responsible for routing all items with user-specific router rules
  return {
    brandNewCount,
    linkedCount,
    processedItems,
    linkedItems,
  }
}
