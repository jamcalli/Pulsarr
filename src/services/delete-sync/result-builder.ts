import type { DeleteSyncResult } from '@root/types/delete-sync.types.js'

/**
 * Creates an empty result object for when no deletion operations are performed
 *
 * @param logMessage - Message to log
 * @returns Empty delete sync result
 */
export function createEmptyResult(_logMessage: string): DeleteSyncResult {
  return {
    total: { deleted: 0, skipped: 0, processed: 0, protected: 0 },
    movies: { deleted: 0, skipped: 0, protected: 0, items: [] },
    shows: { deleted: 0, skipped: 0, protected: 0, items: [] },
  }
}

/**
 * Creates a result object for when safety was triggered and operation was aborted
 *
 * @param message - Error message explaining why safety was triggered
 * @param seriesCount - Total number of series (for skipped count)
 * @param moviesCount - Total number of movies (for skipped count)
 * @returns Delete sync result indicating aborted operation
 */
export function createSafetyTriggeredResult(
  message: string,
  seriesCount = 0,
  moviesCount = 0,
): DeleteSyncResult {
  return {
    total: {
      deleted: 0,
      skipped: seriesCount + moviesCount,
      protected: 0,
      processed: seriesCount + moviesCount,
    },
    movies: {
      deleted: 0,
      skipped: moviesCount,
      protected: 0,
      items: [],
    },
    shows: {
      deleted: 0,
      skipped: seriesCount,
      protected: 0,
      items: [],
    },
    safetyTriggered: true,
    safetyMessage: message,
  }
}
