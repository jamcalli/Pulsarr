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

export interface ProcessItemsInput {
  user: Friend
  items: TokenWatchlistItem[]
}

export interface ProcessItemsResult {
  brandNewCount: number
  linkedCount: number
  processedItems: WatchlistItem[]
  linkedItems: WatchlistItem[]
}

export interface UnifiedProcessorDeps {
  db: DatabaseService
  logger: FastifyBaseLogger
  config: Config
  fastify: FastifyInstance
  plexLabelSyncService?: PlexLabelSyncService
  handleLinkedItemsForLabelSync: (linkItems: WatchlistItem[]) => Promise<void>
}

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

/** Never routes, so the caller must route both new and linked items because router rules differ per user. */
export async function processItemsForUser(
  input: ProcessItemsInput,
  deps: UnifiedProcessorDeps,
): Promise<ProcessItemsResult> {
  const { user, items } = input
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
    'Processing items for user',
  )

  const allKeys = items.map((item) => item.key ?? item.id).filter(Boolean)

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

  const existingItems = await db.getWatchlistItemsByKeys(allKeys)

  const userWatchlistMap = new Map<Friend, Set<TokenWatchlistItem>>()
  userWatchlistMap.set(user, new Set(items))

  const { brandNewItems, existingItemsToLink } = categorizeItems(
    userWatchlistMap,
    existingItems,
    { logger },
    false,
  )

  const processedItems: WatchlistItem[] = []
  const brandNewCount = brandNewItems.get(user)?.size ?? 0

  if (brandNewCount > 0) {
    logger.debug(
      { userId: user.userId, count: brandNewCount },
      'Processing brand new items',
    )

    const processedMap = await processAndSaveNewItems(
      brandNewItems,
      false,
      buildItemProcessorDeps(deps),
    )

    for (const itemSet of processedMap.values()) {
      processedItems.push(...itemSet)
    }
  }

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

    linkedItems = Array.from(linkedItemsSet ?? [])
  }

  logger.debug(
    {
      userId: user.userId,
      username: user.username,
      brandNew: brandNewCount,
      linked: linkedItems.length,
    },
    'Items processed for user',
  )

  return {
    brandNewCount,
    linkedCount,
    processedItems,
    linkedItems,
  }
}
