import type { ApprovalRequest } from '@root/types/approval.types.js'
import type { ApprovalService } from '@services/approval.service.js'
import type { DatabaseService } from '@services/database.service.js'
import type { FastifyBaseLogger } from 'fastify'

export interface OrphanedApprovalCleanupDeps {
  db: DatabaseService
  approvalService: ApprovalService
  existingMovieGuids: Set<string>
  existingShowGuids: Set<string>
  config: {
    deleteSyncCleanupApprovals: boolean
  }
  logger: FastifyBaseLogger
}

/**
 * Checks whether any GUID in a record's contentGuids exists in the given set
 */
function hasMatchingGuid(
  record: ApprovalRequest,
  guidSet: Set<string>,
): boolean {
  return record.contentGuids.some((guid) => guidSet.has(guid))
}

/**
 * Clean up orphaned approval requests whose content no longer exists in Radarr/Sonarr.
 * Cross-references approved/auto_approved records against already-fetched content GUID sets.
 * Catches approval records for content deleted before deleteSyncCleanupApprovals was enabled.
 */
export async function cleanupOrphanedApprovalRequests(
  deps: OrphanedApprovalCleanupDeps,
  dryRun: boolean,
): Promise<{ cleaned: number }> {
  const {
    db,
    approvalService,
    existingMovieGuids,
    existingShowGuids,
    config,
    logger,
  } = deps

  if (!config.deleteSyncCleanupApprovals || dryRun) {
    return { cleaned: 0 }
  }

  try {
    const allApproved = await db.getAllApprovedApprovalRequests()

    let cleaned = 0

    for (const record of allApproved) {
      const guidSet =
        record.contentType === 'movie' ? existingMovieGuids : existingShowGuids

      // Skip if no content exists for this type (no instances configured)
      if (guidSet.size === 0) {
        continue
      }

      if (!hasMatchingGuid(record, guidSet)) {
        try {
          await approvalService.deleteApprovalRequest(record.id)
          cleaned++
        } catch (error) {
          logger.error(
            { error, approvalId: record.id, title: record.contentTitle },
            'Error deleting orphaned approval request',
          )
        }
      }
    }

    if (cleaned > 0) {
      logger.info(
        `Cleaned up ${cleaned} orphaned approval records (content no longer in Radarr/Sonarr)`,
      )
    }

    return { cleaned }
  } catch (error) {
    logger.error({ error }, 'Error cleaning up orphaned approval requests')
    return { cleaned: 0 }
  }
}

export interface ApprovalCleanupDeps {
  db: DatabaseService
  approvalService: ApprovalService
  deletedMovieGuids: Set<string>
  deletedShowGuids: Set<string>
  config: {
    deleteSyncCleanupApprovals: boolean
  }
  logger: FastifyBaseLogger
}

/**
 * Clean up approval requests for content that was deleted
 * This removes approval records from the database for items that no longer exist
 */
export async function cleanupApprovalRequestsForDeletedContent(
  deps: ApprovalCleanupDeps,
  dryRun: boolean,
): Promise<void> {
  const {
    db,
    approvalService,
    deletedMovieGuids,
    deletedShowGuids,
    config,
    logger,
  } = deps

  if (!config.deleteSyncCleanupApprovals || dryRun) {
    return
  }

  try {
    let totalCleaned = 0

    // Clean up movie approval requests
    if (deletedMovieGuids.size > 0) {
      logger.info(
        `Cleaning up movie approval requests for content with ${deletedMovieGuids.size} deleted GUIDs`,
      )
      const movieApprovals = await db.getApprovalRequestsByGuids(
        deletedMovieGuids,
        'movie',
      )

      // Use ApprovalService to delete each request (handles SSE events)
      for (const approval of movieApprovals) {
        try {
          await approvalService.deleteApprovalRequest(approval.id)
          totalCleaned++
        } catch (error) {
          logger.error(
            {
              error,
              approvalId: approval.id,
              title: approval.contentTitle,
            },
            'Error deleting individual approval request during cleanup',
          )
        }
      }

      logger.info(`Cleaned up ${movieApprovals.length} movie approval records`)
    }

    // Clean up show approval requests
    if (deletedShowGuids.size > 0) {
      logger.info(
        `Cleaning up show approval requests for content with ${deletedShowGuids.size} deleted GUIDs`,
      )
      const showApprovals = await db.getApprovalRequestsByGuids(
        deletedShowGuids,
        'show',
      )

      // Use ApprovalService to delete each request (handles SSE events)
      for (const approval of showApprovals) {
        try {
          await approvalService.deleteApprovalRequest(approval.id)
          totalCleaned++
        } catch (error) {
          logger.error(
            {
              error,
              approvalId: approval.id,
              title: approval.contentTitle,
            },
            'Error deleting individual approval request during cleanup',
          )
        }
      }

      logger.info(`Cleaned up ${showApprovals.length} show approval records`)
    }

    if (totalCleaned > 0) {
      logger.info(`Total approval requests cleaned up: ${totalCleaned}`)
    }
  } catch (cleanupError) {
    logger.error(
      { error: cleanupError },
      'Error cleaning up approval requests for deleted content',
    )
  }
}
