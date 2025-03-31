import fp from 'fastify-plugin'
import type { FastifyInstance } from 'fastify'
import { AppriseNotificationService } from '@services/apprise-notifications.service.js'

declare module 'fastify' {
  interface FastifyInstance {
    apprise: AppriseNotificationService
  }
}

// In src/plugins/custom/apprise-notifications.ts

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

      // Function to check Apprise status
      const checkAppriseStatus = async (): Promise<boolean> => {
        try {
          const statusUrl = new URL('/status', appriseUrl).toString()

          const controller = new AbortController()
          const timeoutId = setTimeout(() => controller.abort(), 5000) // 5 second timeout

          const response = await fetch(statusUrl, {
            method: 'GET',
            signal: controller.signal,
          })

          clearTimeout(timeoutId)

          return response.status === 200
        } catch (error) {
          return false
        }
      }

      // Wait for Apprise to be ready with retries
      const waitForApprise = async (
        maxRetries = 10, // 10 attempts
        retryIntervalMs = 1000, // Checking every second
      ): Promise<boolean> => {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          fastify.log.info(
            `Checking Apprise availability (attempt ${attempt}/${maxRetries})`,
          )

          const isAvailable = await checkAppriseStatus()

          if (isAvailable) {
            fastify.log.info('Successfully connected to Apprise container')
            await fastify.updateConfig({ enableApprise: true })
            fastify.log.info(
              'Apprise notification service is configured and enabled',
            )
            fastify.log.info(`Using Apprise container at: ${appriseUrl}`)

            // Emit the updated status after enabling
            emitAppriseStatus(fastify)
            return true
          }

          if (attempt < maxRetries) {
            fastify.log.debug(
              `Apprise not yet available, waiting ${retryIntervalMs / 1000} second before retry...`,
            )
            await new Promise((resolve) => setTimeout(resolve, retryIntervalMs))
          }
        }

        fastify.log.warn(
          'Could not connect to Apprise container after maximum retries, notifications will be disabled',
        )
        await fastify.updateConfig({ enableApprise: false })

        // Emit the updated status after disabling
        emitAppriseStatus(fastify)
        return false
      }

      // Start the waiting process
      waitForApprise().catch((error) => {
        fastify.log.error('Error in Apprise availability check:', error)
        fastify.updateConfig({ enableApprise: false })
        emitAppriseStatus(fastify)
      })
    } else {
      fastify.log.info(
        'No Apprise URL configured, Apprise notifications will be disabled',
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
  },
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
