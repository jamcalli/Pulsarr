/**
 * Plex Label Sync Plugin
 *
 * Registers PlexLabelSyncService and PendingLabelSyncProcessorService
 * for label synchronization functionality
 */
import fp from 'fastify-plugin'
import type { FastifyInstance } from 'fastify'
import { PlexLabelSyncService } from '@services/plex-label-sync.service.js'
import { PendingLabelSyncProcessorService } from '@services/pending-label-sync-processor.service.js'

declare module 'fastify' {
  interface FastifyInstance {
    plexLabelSyncService: PlexLabelSyncService
    pendingLabelSyncProcessor: PendingLabelSyncProcessorService
  }
}

export default fp(
  async function plexLabelSync(fastify: FastifyInstance) {
    // Get label sync configuration with defaults
    const labelSyncConfig = fastify.config.plexLabelSync || {
      enabled: false,
      liveMode: true,
      batchMode: false,
      labelFormat: 'pulsarr:{username}',
      syncInterval: 3600,
      pendingRetryInterval: 30,
      pendingMaxAge: 30,
      excludeLabels: [],
      preserveExistingLabels: true,
      labelAllVersions: true,
    }

    // Create the Plex label sync service
    const plexLabelSyncService = new PlexLabelSyncService(
      fastify.log,
      fastify.plexServerService,
      fastify.db,
      labelSyncConfig,
    )

    // Create the pending sync processor service
    const pendingLabelSyncProcessor = new PendingLabelSyncProcessorService(
      fastify.log,
      fastify.db,
      plexLabelSyncService,
      fastify,
      fastify.config,
    )

    // Decorate fastify instance with services
    fastify.decorate('plexLabelSyncService', plexLabelSyncService)
    fastify.decorate('pendingLabelSyncProcessor', pendingLabelSyncProcessor)

    // Initialize services on ready
    fastify.addHook('onReady', async () => {
      if (labelSyncConfig.enabled) {
        try {
          await fastify.pendingLabelSyncProcessor.initialize()
          fastify.log.info('Plex label sync services initialized successfully')
        } catch (error) {
          fastify.log.error(
            { error },
            'Error during Plex label sync initialization',
          )
          // Don't throw - let server continue without label sync functionality
        }
      } else {
        fastify.log.info(
          'Plex label sync is disabled - services loaded but not started',
        )
      }
    })

    // Graceful shutdown on close
    fastify.addHook('onClose', async () => {
      try {
        await fastify.pendingLabelSyncProcessor.shutdown()
        fastify.log.info('Plex label sync services stopped gracefully')
      } catch (error) {
        fastify.log.error(
          { error },
          'Error during Plex label sync service shutdown',
        )
      }
    })
  },
  {
    name: 'plex-label-sync',
    dependencies: ['database', 'config', 'plex-server', 'scheduler'],
  },
)
