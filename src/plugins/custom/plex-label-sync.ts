import { PendingLabelSyncProcessorService } from '@services/pending-label-sync-processor.service.js'
import { PlexLabelSyncService } from '@services/plex-label-sync.service.js'
import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'

declare module 'fastify' {
  interface FastifyInstance {
    plexLabelSyncService: PlexLabelSyncService
    pendingLabelSyncProcessor: PendingLabelSyncProcessorService
  }
}

const PENDING_SYNC_POLL_INTERVAL = { seconds: 120 }
const PENDING_SYNC_CLEANUP_INTERVAL = { seconds: 60 }

export default fp(
  async function plexLabelSync(fastify: FastifyInstance) {
    const plexLabelSyncService = new PlexLabelSyncService(fastify.log, fastify)
    const pendingLabelSyncProcessor = new PendingLabelSyncProcessorService(
      fastify.log,
      fastify,
    )

    fastify.decorate('plexLabelSyncService', plexLabelSyncService)
    fastify.decorate('pendingLabelSyncProcessor', pendingLabelSyncProcessor)

    fastify.addHook('onReady', async () => {
      try {
        fastify.plexServerService.onContentScanned(() => {
          if (!fastify.config?.plexLabelSync?.enabled) return
          void fastify.pendingLabelSyncProcessor.processPendingLabelSyncs()
        })

        // A disconnect may have dropped scan events, so sync once to bridge the gap
        fastify.plexServerService.onSSE('disconnected', () => {
          if (!fastify.config?.plexLabelSync?.enabled) return
          void fastify.pendingLabelSyncProcessor.processPendingLabelSyncs()
        })

        fastify.scheduler.scheduleInternalJob(
          'pending-label-sync-processor',
          PENDING_SYNC_POLL_INTERVAL,
          async () => {
            if (!fastify.config?.plexLabelSync?.enabled) {
              return
            }

            // SSE content-scanned events cover the fast path, so polling only runs while SSE is down
            if (fastify.plexServerService.isSSEConnected()) {
              return
            }

            await fastify.pendingLabelSyncProcessor.processPendingLabelSyncs()
          },
        )

        fastify.scheduler.scheduleInternalJob(
          'pending-label-sync-cleanup',
          PENDING_SYNC_CLEANUP_INTERVAL,
          async () => {
            if (!fastify.config?.plexLabelSync?.enabled) {
              return
            }

            await fastify.pendingLabelSyncProcessor.cleanupExpired()
          },
        )

        await fastify.scheduler.scheduleJob(
          'plex-label-full-sync',
          async () => {
            if (!fastify.config?.plexLabelSync?.enabled) {
              return
            }

            await fastify.plexLabelSyncService.syncAllLabels()
          },
          {
            defaultSchedule: {
              type: 'cron',
              config: { expression: '0 2 * * 0' },
              enabled: false,
            },
          },
        )

        fastify.log.debug(
          'Plex label sync scheduler jobs registered successfully',
        )
      } catch (error) {
        fastify.log.error(
          { error },
          'Error during Plex label sync scheduler registration',
        )
      }
    })
  },
  {
    name: 'plex-label-sync',
    dependencies: [
      'config',
      'database',
      'plex-server',
      'progress',
      'radarr-manager',
      'scheduler',
      'sonarr-manager',
    ],
  },
)
