import fp from 'fastify-plugin'
import type { FastifyInstance } from 'fastify'
import { WatchlistWorkflowService } from '@services/watchlist-workflow.service.js'

declare module 'fastify' {
  interface FastifyInstance {
    watchlistWorkflow: WatchlistWorkflowService
  }
}

export default fp(
  async (fastify: FastifyInstance) => {
    const rssCheckIntervalMs = (fastify.config.syncIntervalSeconds || 10) * 1000
    const queueProcessDelayMs =
      (fastify.config.queueProcessDelaySeconds || 60) * 1000

    const watchlistWorkflow = new WatchlistWorkflowService(
      fastify.log,
      fastify,
      rssCheckIntervalMs,
      queueProcessDelayMs,
    )

    // Create wrapped versions of the startWorkflow and stop methods
    // that will emit status events after state changes
    const originalStartWorkflow = watchlistWorkflow.startWorkflow
    watchlistWorkflow.startWorkflow = async function (...args) {
      const result = await originalStartWorkflow.apply(this, args)
      emitWatchlistWorkflowStatus(fastify)
      return result
    }

    const originalStop = watchlistWorkflow.stop
    watchlistWorkflow.stop = async function (...args) {
      const result = await originalStop.apply(this, args)
      emitWatchlistWorkflowStatus(fastify)
      return result
    }

    emitWatchlistWorkflowStatus(fastify)

    const statusInterval = setInterval(() => {
      if (fastify.progress.hasActiveConnections()) {
        emitWatchlistWorkflowStatus(fastify)
      }
    }, 1000) // 1 second

    fastify.addHook('onClose', () => {
      clearInterval(statusInterval)
    })

    // Auto-start workflow when config is ready
    const startWorkflow = async () => {
      try {
        fastify.log.info('Waiting for config to be ready...')
        await fastify.waitForConfig()

        // Check if workflow is already running or starting before attempting to start
        const currentStatus = watchlistWorkflow.getStatus()
        if (currentStatus === 'running' || currentStatus === 'starting') {
          fastify.log.info(
            `Config ready, but workflow is already ${currentStatus}. Skipping auto-start.`,
          )
          return
        }

        fastify.log.info('Config ready, starting workflow')
        await watchlistWorkflow.startWorkflow()
      } catch (err) {
        fastify.log.error({ error: err }, 'Error in workflow startup:')
      }
    }

    setImmediate(startWorkflow)

    fastify.decorate('watchlistWorkflow', watchlistWorkflow)

    fastify.addHook('onClose', async () => {
      const status = watchlistWorkflow.getStatus()
      if (status === 'running' || status === 'starting') {
        fastify.log.info('Stopping watchlist workflow during shutdown')
        await watchlistWorkflow.stop()
      }
    })
  },
  {
    name: 'watchlist-workflow-service',
    dependencies: [
      'plex-watchlist',
      'sonarr-manager',
      'radarr-manager',
      'sync',
      'config',
      'progress',
      'scheduler',
    ],
  },
)

/**
 * Emits a progress event with the current watchlist workflow status.
 *
 * If there are active progress connections, the function retrieves the workflow status and determines
 * the synchronization mode—using "manual" if an RSS fallback is enabled, or "rss" otherwise. It generates
 * a unique operation ID based on the current time and emits a progress event with a status message and metadata
 * that includes the sync mode and RSS availability.
 *
 * @remarks
 * The event is only emitted when active progress connections are present on the Fastify instance.
 */
function emitWatchlistWorkflowStatus(fastify: FastifyInstance) {
  if (!fastify.progress.hasActiveConnections()) {
    return
  }

  const status = fastify.watchlistWorkflow.getStatus()
  const syncMode = fastify.watchlistWorkflow.getIsUsingRssFallback()
    ? 'manual'
    : 'rss'
  const operationId = `watchlist-workflow-status-${Date.now()}`

  fastify.progress.emit({
    operationId,
    type: 'system',
    phase: 'info',
    progress: 100,
    message: `Watchlist workflow status: ${status}`,
    metadata: {
      syncMode,
      rssAvailable: !fastify.watchlistWorkflow.getIsUsingRssFallback(),
    },
  })
}
