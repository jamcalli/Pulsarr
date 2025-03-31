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

      // Implement retry mechanism for Apprise initialization
      const retryConnectToApprise = async (
        maxRetries = 10, 
        retryIntervalMs = 1000 // 1 second between retries
      ) => {
        let retries = 0;
        let isReachable = false;
        
        while (retries < maxRetries && !isReachable) {
          fastify.log.debug(`Attempt ${retries + 1}/${maxRetries} - Pinging Apprise server to verify it is reachable`)
          
          try {
            isReachable = await pingAppriseServer(appriseUrl);
            
            if (isReachable) {
              fastify.log.info('Successfully connected to Apprise container')
              // Set enableApprise to true directly in the runtime config
              await fastify.updateConfig({ enableApprise: true })
              fastify.log.info('Apprise notification service is configured and enabled')
              fastify.log.info(`Using Apprise container at: ${appriseUrl}`)
              
              // Emit the updated status after enabling
              emitAppriseStatus(fastify)
              return true;
            } else {
              fastify.log.debug(`Attempt ${retries + 1}/${maxRetries} - Could not connect to Apprise container, will retry in ${retryIntervalMs/1000} second`)
              retries++;
              
              // Wait before the next retry
              await new Promise(resolve => setTimeout(resolve, retryIntervalMs));
            }
          } catch (error) {
            fastify.log.debug(`Attempt ${retries + 1}/${maxRetries} - Error connecting to Apprise container, will retry in ${retryIntervalMs/1000} second`)
            retries++;
            
            // Wait before the next retry
            await new Promise(resolve => setTimeout(resolve, retryIntervalMs));
          }
        }
        
        // All retries failed
        fastify.log.warn(`After ${maxRetries} attempts, could not connect to Apprise container, notifications will be disabled`)
        await fastify.updateConfig({ enableApprise: false })
        
        // Emit the updated status after disabling
        emitAppriseStatus(fastify)
        return false;
      };

      // Start the retry process
      retryConnectToApprise().catch(error => {
        fastify.log.error('Unexpected error in Apprise retry mechanism:', error)
      });

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
