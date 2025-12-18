import type { ApprovalService } from '@services/approval.service.js'
import type { DatabaseService } from '@services/database.service.js'
import type { FastifyBaseLogger } from 'fastify'

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
