import fp from 'fastify-plugin'
import type { FastifyInstance } from 'fastify'
import { AppriseNotificationService } from '@services/apprise-notifications.service.js'

declare module 'fastify' {
  interface FastifyInstance {
    apprise: AppriseNotificationService
  }
}

export default fp(
  async (fastify: FastifyInstance) => {
    fastify.log.info('Initializing Apprise notification plugin')

    // Create and register the Apprise notification service
    const appriseService = new AppriseNotificationService(fastify.log, fastify)
    fastify.decorate('apprise', appriseService)

    // Get the Apprise URL from the config (already loaded from .env)
    const appriseUrl = fastify.config.appriseUrl || ''

    // Emit initial status - before we check availability
    emitAppriseStatus(fastify)

    // Set up a periodic status interval for status
    const statusInterval = setInterval(() => {
      if (fastify.progress.hasActiveConnections()) {
        emitAppriseStatus(fastify)
      }
    }, 1000) // 1 second

    fastify.addHook('onClose', () => {
      clearInterval(statusInterval)
    })

    // Only proceed if we have an Apprise URL configured
    if (appriseUrl) {
      fastify.log.info(`Found Apprise URL in configuration: ${appriseUrl}`)

      // Add a delay before checking
      const delayedCheck = async () => {
        // Wait a bit to allow Apprise to fully initialize
        fastify.log.info('Waiting 5 seconds for Apprise to initialize...')
        await new Promise(resolve => setTimeout(resolve, 5000))
        
        try {
          fastify.log.debug('Pinging Apprise server to verify it is reachable')
          const isReachable = await pingAppriseServer(appriseUrl)

          if (isReachable) {
            fastify.log.info('Successfully connected to Apprise container')
            // Set enableApprise to true directly in the runtime config
            await fastify.updateConfig({ enableApprise: true })
            fastify.log.info('Apprise notification service is configured and enabled')
            fastify.log.info(`Using Apprise container at: ${appriseUrl}`)

            // Emit the updated status after enabling
            emitAppriseStatus(fastify)
          } else {
            fastify.log.warn('Could not connect to Apprise container, notifications will be disabled')
            await fastify.updateConfig({ enableApprise: false })

            // Emit the updated status after disabling
            emitAppriseStatus(fastify)
          }
        } catch (error) {
          fastify.log.error('Error connecting to Apprise container:', error)
          await fastify.updateConfig({ enableApprise: false })

          // Emit the updated status on error
          emitAppriseStatus(fastify)
        }
      }

      // Start the delayed check - don't await it
      delayedCheck().catch(error => {
        fastify.log.error('Unexpected error in Apprise initialization:', error)
      })
    } else {
      fastify.log.info(
        'No Apprise URL configured, Apprise notifications will be disabled'
      )
      await fastify.updateConfig({ enableApprise: false })

      // Emit the updated status when no URL configured
      emitAppriseStatus(fastify)
    }

    fastify.log.info('Apprise notification plugin initialized successfully')
  },
  {
    name: 'apprise-notification-service',
    dependencies: ['config', 'database', 'progress'],
  }
)

/**
 * Ping function to check if the Apprise server is reachable
 *
 * @param url - The Apprise server URL
 * @returns Promise resolving to true if server is reachable, false otherwise
 */
async function pingAppriseServer(url: string): Promise<boolean> {
  if (!url || url.trim() === '') {
    return false
  }
  try {
    const pingUrl = new URL('/', url).toString()

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 5000) // 5 second timeout

    const response = await fetch(pingUrl, {
      method: 'GET',
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    return response.ok
  } catch (error) {
    return false
  }
}

/**
 * Emits the current Apprise service status to the progress service
 *
 * @param fastify - The FastifyInstance
 */
function emitAppriseStatus(fastify: FastifyInstance) {
  if (!fastify.progress.hasActiveConnections()) {
    return
  }

  const status = fastify.config.enableApprise ? 'enabled' : 'disabled'
  const operationId = `apprise-status-${Date.now()}`

  fastify.progress.emit({
    operationId,
    type: 'system',
    phase: 'info',
    progress: 100,
    message: `Apprise notification service: ${status}`,
  })
}
