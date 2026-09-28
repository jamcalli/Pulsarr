import type { TokenWatchlistItem } from '@root/types/plex.types.js'
import type { DatabaseService } from '@services/database.service.js'
import { parseGuids } from '@utils/guid-handler.js'
import type { FastifyBaseLogger } from 'fastify'
import type { WorkflowDeps } from '../types.js'

export interface AttributionPrefetchedData {
  shows?: TokenWatchlistItem[]
  movies?: TokenWatchlistItem[]
  userById?: Map<
    number,
    NonNullable<Awaited<ReturnType<DatabaseService['getUser']>>>
  >
}

function normalizeUserId(val: unknown): number | null {
  const id =
    typeof val === 'number'
      ? val
      : typeof val === 'object' && val !== null && 'id' in val
        ? (val as { id: number }).id
        : Number.parseInt(String(val), 10)
  return Number.isFinite(id) && id > 0 ? id : null
}

function buildWatchlistIndexes(allWatchlistItems: TokenWatchlistItem[]): {
  keyIndex: Map<string, TokenWatchlistItem[]>
  guidIndex: Map<string, TokenWatchlistItem[]>
} {
  const keyIndex = new Map<string, TokenWatchlistItem[]>()
  const guidIndex = new Map<string, TokenWatchlistItem[]>()

  for (const item of allWatchlistItems) {
    if (item.key) {
      const arr = keyIndex.get(item.key)
      if (arr) arr.push(item)
      else keyIndex.set(item.key, [item])
    }
    for (const g of parseGuids(item.guids)) {
      const arr = guidIndex.get(g)
      if (arr) arr.push(item)
      else guidIndex.set(g, [item])
    }
  }

  return { keyIndex, guidIndex }
}

function findMatchingWatchlistItem(
  approvalRecord: {
    id: number
    contentKey: string
    contentGuids: string[]
    contentTitle: string
  },
  keyIndex: Map<string, TokenWatchlistItem[]>,
  guidIndex: Map<string, TokenWatchlistItem[]>,
  logger: FastifyBaseLogger,
): { item: TokenWatchlistItem | null; ambiguous: boolean } {
  if (approvalRecord.contentKey) {
    const keyCandidates = keyIndex.get(approvalRecord.contentKey)
    if (keyCandidates && keyCandidates.length === 1) {
      return { item: keyCandidates[0], ambiguous: false }
    }
    if (keyCandidates && keyCandidates.length > 1) {
      const userIds = new Set<number>()
      for (const it of keyCandidates) {
        const uid = normalizeUserId(it.user_id)
        if (uid) userIds.add(uid)
      }
      if (userIds.size === 1) {
        const onlyUserId = [...userIds][0]
        const matchingItem = keyCandidates.find(
          (it) => normalizeUserId(it.user_id) === onlyUserId,
        )
        return { item: matchingItem ?? null, ambiguous: false }
      }
      logger.warn(
        `Ambiguous key match for approval record ${approvalRecord.id} ("${approvalRecord.contentTitle}"); multiple users share content key. Skipping attribution to avoid misattribution.`,
      )
      return { item: null, ambiguous: true }
    }
  }

  const recordGuids = approvalRecord.contentGuids
  const candidateSet = new Set<TokenWatchlistItem>()
  for (const g of recordGuids) {
    const arr = guidIndex.get(g)
    if (arr) {
      for (const it of arr) candidateSet.add(it)
    }
  }
  const candidates = [...candidateSet]

  if (candidates.length === 1) {
    return { item: candidates[0], ambiguous: false }
  }
  if (candidates.length > 1) {
    const userIds = new Set<number>()
    for (const it of candidates) {
      const uid = normalizeUserId(it.user_id)
      if (uid) userIds.add(uid)
    }
    if (userIds.size === 1) {
      const onlyUserId = [...userIds][0]
      const matchingItem = candidates.find(
        (it) => normalizeUserId(it.user_id) === onlyUserId,
      )
      return { item: matchingItem ?? null, ambiguous: false }
    }
    logger.warn(
      `Ambiguous GUID match for approval record ${approvalRecord.id} ("${approvalRecord.contentTitle}"); multiple users share GUIDs. Skipping attribution to avoid misattribution.`,
    )
    return { item: null, ambiguous: true }
  }

  return { item: null, ambiguous: false }
}

export async function updateAutoApprovalUserAttribution(
  deps: Pick<WorkflowDeps, 'logger' | 'db' | 'fastify'>,
  prefetched?: AttributionPrefetchedData,
): Promise<void> {
  try {
    deps.logger.debug('Updating auto-approval user attribution')

    const systemApprovalRecords = await deps.db.getApprovalRequestsByCriteria({
      userId: 0,
      status: 'auto_approved',
    })

    if (systemApprovalRecords.length === 0) {
      deps.logger.debug('No system auto-approval records found to update')
      return
    }

    deps.logger.debug(
      `Found ${systemApprovalRecords.length} system auto-approval records to process`,
    )

    const watchlistShows =
      prefetched?.shows ?? (await deps.db.getAllShowWatchlistItems())
    const watchlistMovies =
      prefetched?.movies ?? (await deps.db.getAllMovieWatchlistItems())
    const allWatchlistItems = [...watchlistShows, ...watchlistMovies]

    const { keyIndex, guidIndex } = buildWatchlistIndexes(allWatchlistItems)

    let updatedRecords = 0
    let ambiguousRecords = 0

    for (const approvalRecord of systemApprovalRecords) {
      try {
        const { item: matchingWatchlistItem, ambiguous } =
          findMatchingWatchlistItem(
            approvalRecord,
            keyIndex,
            guidIndex,
            deps.logger,
          )

        if (ambiguous) {
          ambiguousRecords++
          continue
        }

        if (matchingWatchlistItem) {
          const numericUserId = normalizeUserId(matchingWatchlistItem.user_id)

          if (!numericUserId) {
            deps.logger.warn(
              `Invalid user_id "${matchingWatchlistItem.user_id}" for approval record ${approvalRecord.id}`,
            )
            continue
          }

          const user =
            prefetched?.userById?.get(numericUserId) ??
            (await deps.db.getUser(numericUserId))
          if (!user) {
            deps.logger.warn(
              `User ${numericUserId} not found for approval record ${approvalRecord.id}`,
            )
            continue
          }

          const updatedRequest = await deps.db.updateApprovalRequestAttribution(
            approvalRecord.id,
            numericUserId,
            `Auto-approved for ${user.name} (attribution updated during reconciliation)`,
          )

          deps.logger.debug(
            `Updated auto-approval record ${approvalRecord.id} from System to ${user.name} for "${approvalRecord.contentTitle}"`,
          )
          updatedRecords++

          if (deps.fastify.progress?.hasActiveConnections() && updatedRequest) {
            const metadata = {
              action: 'updated' as const,
              requestId: updatedRequest.id,
              userId: updatedRequest.userId,
              userName: updatedRequest.userName || user.name,
              contentTitle: updatedRequest.contentTitle,
              contentType: updatedRequest.contentType,
              status: updatedRequest.status,
            }

            deps.fastify.progress.emit({
              operationId: `approval-${updatedRequest.id}`,
              type: 'approval',
              phase: 'updated',
              progress: 100,
              message: `Updated auto-approval attribution for "${updatedRequest.contentTitle}" to ${user.name}`,
              metadata,
            })
          }
        } else {
          deps.logger.debug(
            `No matching watchlist item found for auto-approval record: "${approvalRecord.contentTitle}" (${approvalRecord.contentKey})`,
          )
        }
      } catch (error) {
        deps.logger.error(
          { error },
          `Failed to update user attribution for approval record ${approvalRecord.id}`,
        )
      }
    }

    if (updatedRecords > 0) {
      deps.logger.info(
        `Updated user attribution for ${updatedRecords} auto-approval records`,
      )
    } else {
      deps.logger.debug(
        'No auto-approval records needed user attribution updates',
      )
    }
    if (ambiguousRecords > 0) {
      deps.logger.warn(
        `Skipped ${ambiguousRecords} auto-approval records due to ambiguous GUID matches across multiple users`,
      )
    }
  } catch (error) {
    deps.logger.error(
      { error },
      'Failed to update auto-approval user attribution',
    )
    // Attribution is cosmetic, so a failure here must not fail the caller's sync
  }
}
