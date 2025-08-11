import type { FastifyPluginAsync } from 'fastify'
import type { z } from 'zod'
import {
  SyncPlexLabelsResponseSchema,
  RemovePlexLabelsResponseSchema,
  CleanupPlexLabelsResponseSchema,
  ErrorSchema,
} from '@schemas/labels/plex-labels.schema.js'

const plugin: FastifyPluginAsync = async (fastify) => {
  // Synchronize plex labels for all content
  fastify.post<{
    Reply: z.infer<typeof SyncPlexLabelsResponseSchema>
  }>(
    '/sync',
    {
      schema: {
        summary: 'Sync plex labels',
        operationId: 'syncPlexLabels',
        description:
          'Synchronize plex labels for all watchlist content. Will automatically reset labels first if enabled in configuration.',
        response: {
          200: SyncPlexLabelsResponseSchema,
          404: ErrorSchema,
          500: ErrorSchema,
        },
        tags: ['Labels'],
      },
    },
    async (_request, reply) => {
      try {
        // Check if plex label sync service is available
        if (!fastify.plexLabelSyncService) {
          return reply.notFound('Plex label sync service not available')
        }

        // Check config first to see if labeling is enabled
        const { plexLabelSync } = fastify.config
        if (!plexLabelSync?.enabled) {
          return {
            success: false,
            message: 'Plex label synchronization is disabled in configuration',
            mode: 'sync' as const,
            results: {
              processed: 0,
              updated: 0,
              failed: 0,
              pending: 0,
            },
          }
        }

        // Call service directly - it handles its own progress emission
        const results = await fastify.plexLabelSyncService.syncAllLabels()

        let message: string
        if (results.processed === 0) {
          message = 'No content found to label (check if watchlist items exist)'
        } else {
          message = `Synchronized labels for ${results.updated} of ${results.processed} items`
        }

        return {
          success: true,
          message,
          mode: 'sync' as const,
          results: {
            processed: results.processed,
            updated: results.updated,
            failed: results.failed,
            pending: results.pending,
          },
        }
      } catch (err) {
        fastify.log.error({ error: err }, 'Error syncing plex labels:')
        return reply.internalServerError('Unable to sync plex labels')
      }
    },
  )

  // Clean up orphaned plex labels and pending syncs
  fastify.post<{
    Reply: z.infer<typeof CleanupPlexLabelsResponseSchema>
  }>(
    '/cleanup',
    {
      schema: {
        summary: 'Cleanup orphaned plex labels',
        operationId: 'cleanupOrphanedPlexLabels',
        description: 'Clean up orphaned plex labels and expired pending syncs',
        response: {
          200: CleanupPlexLabelsResponseSchema,
          404: ErrorSchema,
          500: ErrorSchema,
        },
        tags: ['Labels'],
      },
    },
    async (_request, reply) => {
      try {
        // Check if plex label sync service is available
        if (!fastify.plexLabelSyncService) {
          return reply.notFound('Plex label sync service not available')
        }

        // Check if cleanup is enabled
        const { plexLabelSync } = fastify.config
        if (!plexLabelSync?.enabled) {
          return {
            success: false,
            message: 'Plex label cleanup is disabled in configuration',
            pending: {
              removed: 0,
              failed: 0,
            },
            orphaned: {
              removed: 0,
              failed: 0,
            },
          }
        }

        // Clean up expired pending syncs
        const expiredPendingCount = await fastify.db.expirePendingLabelSyncs()

        // Clean up orphaned labels if enabled in configuration
        let orphanedResult = { removed: 0, failed: 0 }
        if (plexLabelSync?.cleanupOrphanedLabels) {
          try {
            orphanedResult =
              await fastify.plexLabelSyncService.cleanupOrphanedPlexLabels()
          } catch (cleanupError) {
            fastify.log.error(
              'Error during orphaned label cleanup:',
              cleanupError,
            )
            orphanedResult = { removed: 0, failed: 1 }
          }
        }

        let message: string
        if (expiredPendingCount === 0 && orphanedResult.removed === 0) {
          if (!plexLabelSync?.cleanupOrphanedLabels) {
            message =
              'No expired pending syncs found to clean up. Orphaned label cleanup is disabled in configuration.'
          } else {
            message =
              'No orphaned labels or expired pending syncs found to clean up'
          }
        } else {
          message = `Cleaned up ${expiredPendingCount} expired pending syncs and ${orphanedResult.removed} orphaned labels`
        }

        return {
          success: true,
          message,
          pending: {
            removed: expiredPendingCount,
            failed: 0,
          },
          orphaned: {
            removed: orphanedResult.removed,
            failed: orphanedResult.failed,
          },
        }
      } catch (err) {
        fastify.log.error({ error: err }, 'Error cleaning up plex labels:')
        return reply.internalServerError('Unable to clean up plex labels')
      }
    },
  )

  // Remove pulsarr labels from content
  fastify.delete<{
    Reply: z.infer<typeof RemovePlexLabelsResponseSchema>
  }>(
    '/remove',
    {
      schema: {
        summary: 'Remove Pulsarr labels from Plex content',
        operationId: 'removePulsarrPlexLabels',
        description:
          'Remove all Pulsarr-created labels from Plex content while preserving other labels',
        response: {
          200: RemovePlexLabelsResponseSchema,
          404: ErrorSchema,
          500: ErrorSchema,
        },
        tags: ['Labels'],
      },
    },
    async (_request, reply) => {
      try {
        // Check if plex label sync service is available
        if (!fastify.plexLabelSyncService) {
          return reply.notFound('Plex label sync service not available')
        }

        // Check config first to see if labeling is enabled
        const { plexLabelSync } = fastify.config
        if (!plexLabelSync?.enabled) {
          return {
            success: false,
            message: 'Plex label removal is disabled in configuration',
            mode: 'remove' as const,
            results: {
              processed: 0,
              removed: 0,
              failed: 0,
            },
          }
        }

        // Call service directly - it handles its own progress emission
        const results = await fastify.plexLabelSyncService.removeAllLabels()

        let message: string
        if (results.processed === 0) {
          message = 'No Pulsarr labels found to remove'
        } else {
          message = `Removed ${results.removed} Pulsarr labels from ${results.processed} items`
        }

        return {
          success: true,
          message,
          mode: 'remove' as const,
          results: {
            processed: results.processed,
            removed: results.removed,
            failed: results.failed,
          },
        }
      } catch (err) {
        fastify.log.error({ error: err }, 'Error removing plex labels:')
        return reply.internalServerError('Unable to remove plex labels')
      }
    },
  )
}

export default plugin
