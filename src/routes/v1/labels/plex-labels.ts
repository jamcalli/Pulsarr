import type { FastifyPluginAsync } from 'fastify'
import type { z } from 'zod'
import {
  PlexLabelingStatusResponseSchema,
  SyncPlexLabelsResponseSchema,
  RemovePlexLabelsResponseSchema,
  RemoveLabelsRequestSchema,
  CleanupPlexLabelsResponseSchema,
  PlexLabelingConfigSchema,
  ErrorSchema,
} from '@schemas/labels/plex-labels.schema.js'

const plugin: FastifyPluginAsync = async (fastify) => {
  // Get plex labeling configuration status
  fastify.get<{
    Reply: z.infer<typeof PlexLabelingStatusResponseSchema>
  }>(
    '/status',
    {
      schema: {
        summary: 'Get plex labeling status',
        operationId: 'getPlexLabelingStatus',
        description: 'Retrieve the current plex labeling configuration status',
        response: {
          200: PlexLabelingStatusResponseSchema,
          500: ErrorSchema,
        },
        tags: ['Labels'],
      },
    },
    async (request, reply) => {
      try {
        const config = await fastify.db.getConfig()
        if (!config) {
          return reply.notFound('Config not found in database')
        }

        // Use the nested plexLabelSync configuration object
        const plexLabelSyncConfig = config.plexLabelSync || {
          enabled: false,
          labelFormat: 'pulsarr:{username}',
          concurrencyLimit: 5,
          removedLabelMode: 'remove' as const,
          removedLabelPrefix: 'pulsarr:removed',
        }

        return {
          success: true,
          message: 'Plex labeling configuration retrieved successfully',
          config: {
            enabled: Boolean(plexLabelSyncConfig.enabled),
            labelFormat: plexLabelSyncConfig.labelFormat,
            concurrencyLimit: plexLabelSyncConfig.concurrencyLimit,
            removedLabelMode: plexLabelSyncConfig.removedLabelMode || 'remove',
            removedLabelPrefix:
              plexLabelSyncConfig.removedLabelPrefix || 'pulsarr:removed',
          },
        }
      } catch (err) {
        if (err instanceof Error && 'statusCode' in err) {
          throw err
        }
        fastify.log.error('Error fetching plex labeling configuration:', err)
        return reply.internalServerError(
          'Unable to fetch plex labeling configuration',
        )
      }
    },
  )

  // Get plex labeling configuration (alias for status)
  fastify.get<{
    Reply: z.infer<typeof PlexLabelingStatusResponseSchema>
  }>(
    '/config',
    {
      schema: {
        summary: 'Get plex labeling config',
        operationId: 'getPlexLabelingConfig',
        description: 'Retrieve the current plex labeling configuration',
        response: {
          200: PlexLabelingStatusResponseSchema,
          500: ErrorSchema,
        },
        tags: ['Labels'],
      },
    },
    async (request, reply) => {
      // Reuse the same logic as /status
      return fastify
        .inject({
          method: 'GET',
          url: '/api/v1/labels/plex-labels/status',
        })
        .then((response) => response.json())
    },
  )

  // Update plex labeling configuration
  fastify.put<{
    Body: z.infer<typeof PlexLabelingConfigSchema>
    Reply: z.infer<typeof PlexLabelingStatusResponseSchema>
  }>(
    '/config',
    {
      schema: {
        summary: 'Update plex labeling config',
        operationId: 'updatePlexLabelingConfig',
        description: 'Update the plex labeling configuration settings',
        body: PlexLabelingConfigSchema,
        response: {
          200: PlexLabelingStatusResponseSchema,
          400: ErrorSchema,
          500: ErrorSchema,
        },
        tags: ['Labels'],
      },
    },
    async (request, reply) => {
      try {
        // Map the request body to nested plexLabelSync config object
        const configUpdate = {
          plexLabelSync: {
            enabled: request.body.enabled,
            labelFormat: request.body.labelFormat,
            concurrencyLimit: request.body.concurrencyLimit || 5,
            removedLabelMode: request.body.removedLabelMode || 'remove',
            removedLabelPrefix:
              request.body.removedLabelPrefix || 'pulsarr:removed',
          },
        }

        // Store current runtime values for revert if needed
        const originalRuntimeValues: Record<string, unknown> = {
          plexLabelSync: fastify.config.plexLabelSync,
        }

        // Update runtime config
        try {
          await fastify.updateConfig(configUpdate)
        } catch (configUpdateError) {
          fastify.log.error('Error updating runtime config:', configUpdateError)
          return reply.badRequest('Failed to update runtime configuration')
        }

        // Update the database
        const dbUpdated = await fastify.db.updateConfig(configUpdate)

        if (!dbUpdated) {
          // Revert runtime config using stored values
          try {
            await fastify.updateConfig(originalRuntimeValues)
          } catch (revertError) {
            fastify.log.error('Failed to revert runtime config:', revertError)
          }
          return reply.badRequest('Failed to update configuration in database')
        }

        // Get the updated config
        const savedConfig = await fastify.db.getConfig()
        if (!savedConfig) {
          return reply.notFound('No configuration found after update')
        }

        // Use the nested plexLabelSync configuration object
        const plexLabelSyncConfig = savedConfig.plexLabelSync || {
          enabled: false,
          labelFormat: 'pulsarr:{username}',
          concurrencyLimit: 5,
          removedLabelMode: 'remove' as const,
          removedLabelPrefix: 'pulsarr:removed',
        }

        return {
          success: true,
          message: 'Plex labeling configuration updated successfully',
          config: {
            enabled: Boolean(plexLabelSyncConfig.enabled),
            labelFormat: plexLabelSyncConfig.labelFormat,
            concurrencyLimit: plexLabelSyncConfig.concurrencyLimit,
            removedLabelMode: plexLabelSyncConfig.removedLabelMode || 'remove',
            removedLabelPrefix:
              plexLabelSyncConfig.removedLabelPrefix || 'pulsarr:removed',
          },
        }
      } catch (err) {
        if (err instanceof Error && 'statusCode' in err) {
          throw err
        }
        fastify.log.error('Error updating plex labeling configuration:', err)
        return reply.internalServerError(
          'Unable to update plex labeling configuration',
        )
      }
    },
  )

  // Synchronize plex labels for all content
  fastify.post<{
    Reply: z.infer<typeof SyncPlexLabelsResponseSchema>
  }>(
    '/sync',
    {
      schema: {
        summary: 'Sync plex labels',
        operationId: 'syncPlexLabels',
        description: 'Synchronize plex labels for all watchlist content',
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
              if (progress >= 5 && progress < 25) {
                phase = 'fetching-data'
              } else if (progress >= 25 && progress < 90) {
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
          // Proceed with sync operation
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

        // Clean up orphaned labels and expired pending syncs
        const orphanedCleanupCount = 0

        let message: string
        if (expiredPendingCount === 0 && orphanedCleanupCount === 0) {
          message =
            'No orphaned labels or expired pending syncs found to clean up'
        } else {
          message = `Cleaned up ${expiredPendingCount} expired pending syncs and ${orphanedCleanupCount} orphaned labels`
        }

        return {
          success: true,
          message,
          pending: {
            removed: expiredPendingCount,
            failed: 0,
          },
          orphaned: {
            removed: orphanedCleanupCount,
            failed: 0,
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
