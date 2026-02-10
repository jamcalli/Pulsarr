import type { DatabaseService } from '@services/database.service.js'
import type { FastifyBaseLogger } from 'fastify'

export interface RollingMonitorCleanupDeps {
  db: DatabaseService
  deletedShowGuids: Set<string>
  logger: FastifyBaseLogger
}

/**
 * Clean up rolling monitored show records for content deleted by delete sync.
 *
 * Extracts TVDB IDs and Sonarr series IDs from the deleted show GUIDs and
 * removes all matching rolling monitor entries (both master and per-user
 * records). Matches on both identifiers to handle entries created without a
 * TVDB ID. This prevents orphaned rolling monitor records from remaining
 * after a series is removed from Sonarr.
 */
export async function cleanupRollingMonitoredShowsForDeletedContent(
  deps: RollingMonitorCleanupDeps,
  dryRun: boolean,
): Promise<void> {
  const { db, deletedShowGuids, logger } = deps

  if (deletedShowGuids.size === 0 || dryRun) {
    return
  }

  try {
    const tvdbIds: string[] = []
    const sonarrSeriesIds: number[] = []

    for (const guid of deletedShowGuids) {
      if (guid.startsWith('tvdb:')) {
        const id = guid.slice(5)
        if (id.length > 0) {
          tvdbIds.push(id)
        }
      } else if (guid.startsWith('sonarr:')) {
        const id = Number.parseInt(guid.slice(7), 10)
        if (!Number.isNaN(id)) {
          sonarrSeriesIds.push(id)
        }
      }
    }

    if (tvdbIds.length === 0 && sonarrSeriesIds.length === 0) {
      return
    }

    logger.info(
      `Cleaning up rolling monitored shows for deleted series (${tvdbIds.length} TVDB IDs, ${sonarrSeriesIds.length} Sonarr series IDs)`,
    )

    const deleted = await db.deleteRollingMonitoredShowsByIds(
      tvdbIds,
      sonarrSeriesIds,
    )

    if (deleted > 0) {
      logger.info(
        `Cleaned up ${deleted} rolling monitored show entries for deleted series`,
      )
    }
  } catch (cleanupError) {
    logger.error(
      { error: cleanupError },
      'Error cleaning up rolling monitored shows for deleted content',
    )
  }
}
