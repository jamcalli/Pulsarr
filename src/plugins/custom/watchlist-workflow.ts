import fp from 'fastify-plugin'
import type { FastifyInstance } from 'fastify'
import { PlexWorkflowService } from '@services/watchlist-workflow.service.js'

declare module 'fastify' {
  interface FastifyInstance {
    plexWorkflow: PlexWorkflowService
  }
}

export default fp(
  async (fastify: FastifyInstance) => {
    const rssCheckIntervalMs = (fastify.config.syncIntervalSeconds || 10) * 1000
    const queueProcessDelayMs = (fastify.config.queueProcessDelaySeconds || 60) * 1000
    
    const plexWorkflow = new PlexWorkflowService(
      fastify.log,
      fastify,
      rssCheckIntervalMs,
      queueProcessDelayMs
    )

    // Create wrapped versions of the startWorkflow and stop methods
    // that will emit status events after state changes
    const originalStartWorkflow = plexWorkflow.startWorkflow
    plexWorkflow.startWorkflow = async function (...args) {
      const result = await originalStartWorkflow.apply(this, args)
      emitPlexWorkflowStatus(fastify)
      return result
    }

    const originalStop = plexWorkflow.stop
    plexWorkflow.stop = async function (...args) {
      const result = await originalStop.apply(this, args)
      emitPlexWorkflowStatus(fastify)
      return result
    }

    emitPlexWorkflowStatus(fastify)

    const statusInterval = setInterval(() => {
      if (fastify.progress.hasActiveConnections()) {
        emitPlexWorkflowStatus(fastify)
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
        fastify.log.info('Config ready, starting workflow')
        await plexWorkflow.startWorkflow()
      } catch (err) {
        fastify.log.error('Error in workflow startup:', err)
      }
    }

    setImmediate(startWorkflow)

    fastify.decorate('plexWorkflow', plexWorkflow)

    fastify.addHook('onClose', async () => {
      if (plexWorkflow.getStatus() === 'running') {
        fastify.log.info('Stopping Plex workflow during shutdown')
        await plexWorkflow.stop()
      }
    })
  },
  {
    name: 'plex-workflow-service',
    dependencies: [
      'plex-watchlist',
      'sonarr-manager',
      'radarr-manager',
      'sync',
      'config',
      'progress',
    ],
  }
)

function emitPlexWorkflowStatus(fastify: FastifyInstance) {
  if (!fastify.progress.hasActiveConnections()) {
    return
  }

  const status = fastify.plexWorkflow.getStatus()
  const operationId = `plex-workflow-status-${Date.now()}`

  fastify.progress.emit({
    operationId,
    type: 'system',
    phase: 'info',
    progress: 100,
    message: `Plex workflow status: ${status}`,
  })
}