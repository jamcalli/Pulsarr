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
          500: ErrorSchema,
        },
        tags: ['Labels'],
      },
    },
    async (request, reply) => {
      try {
        // Check if plex label sync service is available
        if (!fastify.plexLabelSyncService) {
          return reply.notFound('Plex label sync service not available')
        }

        // Check config first to see if labeling is enabled
        const config = await fastify.db.getConfig()
        if (!config || !config.plexLabelSync?.enabled) {
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

        // Set up SSE progress reporting
        const operationId = `plex-label-sync-${Date.now()}`
        const emitProgress = fastify?.progress?.hasActiveConnections() || false

        const progressCallback = emitProgress
          ? (progress: number, message: string) => {
              // Determine phase based on progress
              let phase = 'start'
              if (progress > 0 && progress < 15) {
                phase = 'fetching-data'
              } else if (progress >= 15 && progress < 90) {
                phase = 'processing-content'
              } else if (progress >= 90) {
                phase = 'complete'
              }

              fastify.progress.emit({
                operationId,
                type: 'plex-label-sync',
                phase,
                progress,
                message,
              })
            }
          : undefined

        // Emit start event
        if (emitProgress) {
          fastify.progress.emit({
            operationId,
            type: 'plex-label-sync',
            phase: 'start',
            progress: 0,
            message: 'Starting Plex label synchronization...',
          })
        }

        try {
          // Proceed with sync operation - will auto-reset if configured
          const results =
            await fastify.plexLabelSyncService.syncAllLabels(progressCallback)

          // Emit completion event
          if (emitProgress) {
            fastify.progress.emit({
              operationId,
              type: 'plex-label-sync',
              phase: 'complete',
              progress: 100,
              message: `Completed Plex label sync: updated ${results.updated} items, failed ${results.failed}, pending ${results.pending}`,
            })
          }

          let message: string
          if (results.processed === 0) {
            message =
              'No content found to label (check if watchlist items exist)'
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
        } catch (syncError) {
          // Emit error event
          if (emitProgress) {
            fastify.progress.emit({
              operationId,
              type: 'plex-label-sync',
              phase: 'error',
              progress: 100,
              message: `Error syncing Plex labels: ${syncError}`,
            })
          }
          throw syncError
        }
      } catch (err) {
        fastify.log.error('Error syncing plex labels:', err)
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
          500: ErrorSchema,
        },
        tags: ['Labels'],
      },
    },
    async (request, reply) => {
      try {
        // Check if plex label sync service is available
        if (!fastify.plexLabelSyncService) {
          return reply.notFound('Plex label sync service not available')
        }

        // Check if cleanup is enabled
        const config = await fastify.db.getConfig()
        if (!config || !config.plexLabelSync?.enabled) {
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
        if (config.plexLabelSync?.cleanupOrphanedLabels) {
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
          if (!config.plexLabelSync?.cleanupOrphanedLabels) {
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
        fastify.log.error('Error cleaning up plex labels:', err)
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
    async (request, reply) => {
      try {
        // Check if plex label sync service is available
        if (!fastify.plexLabelSyncService) {
          return reply.notFound('Plex label sync service not available')
        }

        // Check config first to see if labeling is enabled
        const config = await fastify.db.getConfig()
        if (!config || !config.plexLabelSync?.enabled) {
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

        // Set up SSE progress reporting
        const operationId = `plex-label-removal-${Date.now()}`
        const emitProgress = fastify?.progress?.hasActiveConnections() || false

        // Emit start event
        if (emitProgress) {
          fastify.progress.emit({
            operationId,
            type: 'plex-label-removal',
            phase: 'start',
            progress: 0,
            message: 'Starting Plex label removal...',
          })
        }

        try {
          // Set up progress callback
          const progressCallback = emitProgress
            ? (progress: number, message: string) => {
                // Determine phase based on progress
                let phase = 'start'
                if (progress >= 5 && progress < 25) {
                  phase = 'fetching-data'
                } else if (progress >= 25 && progress < 90) {
                  phase = 'processing-content'
                } else if (progress >= 90) {
                  phase = 'complete'
                }

                fastify.progress.emit({
                  operationId,
                  type: 'plex-label-removal',
                  phase,
                  progress,
                  message,
                })
              }
            : undefined

          // Call the service method to remove Pulsarr labels
          const results =
            await fastify.plexLabelSyncService.removeAllLabels(progressCallback)

          // Emit completion event
          if (emitProgress) {
            fastify.progress.emit({
              operationId,
              type: 'plex-label-removal',
              phase: 'complete',
              progress: 100,
              message: `Completed Plex label removal: removed ${results.removed} labels from ${results.processed} items, ${results.failed} failed`,
            })
          }

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
        } catch (removeError) {
          // Emit error event
          if (emitProgress) {
            fastify.progress.emit({
              operationId,
              type: 'plex-label-removal',
              phase: 'error',
              progress: 100,
              message: `Error removing Plex labels: ${removeError}`,
            })
          }
          throw removeError
        }
      } catch (err) {
        fastify.log.error('Error removing plex labels:', err)
        return reply.internalServerError('Unable to remove plex labels')
      }
    },
  )
}

export default plugin
