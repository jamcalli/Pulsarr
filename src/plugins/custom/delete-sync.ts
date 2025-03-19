/**
 * Delete Sync Service Plugin
 *
 * This plugin registers the DeleteSyncService with the Fastify application
 * and configures a scheduled job to run the delete sync operation at the
 * configured interval.
 *
 * It also provides API endpoints for manually triggering the delete sync
 * and viewing current deletion settings.
 *
 * Dependencies:
 * - @fastify/schedule: For scheduling the delete operation
 * - toad-scheduler: For job scheduling implementation
 * - Database service: For accessing watchlist data
 * - Sonarr/Radarr manager services: For executing deletions
 * - Configuration service: For access to deletion settings
 */
import fp from 'fastify-plugin'
import type { FastifyInstance } from 'fastify'
import { DeleteSyncService } from '@services/delete-sync.service.js'
import { AsyncTask, SimpleIntervalJob } from 'toad-scheduler'

declare module 'fastify' {
  interface FastifyInstance {
    deleteSync: DeleteSyncService
  }
}

export default fp(
  async (fastify: FastifyInstance) => {
    fastify.log.info('Initializing delete sync plugin')
    
    // Create and register the delete sync service
    const service = new DeleteSyncService(fastify.log, fastify)
    fastify.decorate('deleteSync', service)
    
    // Configure the deletion job based on application configuration
    const intervalDays = fastify.config.deleteIntervalDays || 7
    const intervalHours = intervalDays * 24
    
    fastify.log.info(`Scheduling delete sync to run every ${intervalDays} days`)
    
    // Create an async task for the delete sync operation
    const task = new AsyncTask(
      'delete-sync',
      async () => {
        try {
          fastify.log.info(`Running scheduled delete sync (interval: ${intervalDays} days)`)
          await service.run()
          fastify.log.info('Scheduled delete sync completed successfully')
        } catch (error) {
          fastify.log.error('Error in scheduled delete sync:', error)
        }
      },
      (error) => {
        fastify.log.error('Delete sync task failed:', error)
      }
    )
    
    // Create a job with the configured interval
    const job = new SimpleIntervalJob(
      { hours: intervalHours },
      task,
      { id: 'delete-sync-job', preventOverrun: true }
    )
    
    // Add the job to the scheduler after Fastify is ready
    fastify.ready().then(() => {
      fastify.scheduler.addSimpleIntervalJob(job)
      fastify.log.info('Delete sync job scheduled successfully')
    })
    
    // Register admin API endpoint for manual triggering
    fastify.get('/api/admin/delete-sync/run', {
      schema: {
        description: 'Manually trigger a delete synchronization operation',
        tags: ['Admin'],
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              message: { type: 'string' }
            }
          }
        }
      },
      handler: async (request, reply) => {
        fastify.log.info('Manually triggered delete sync via API')
        await service.run()
        return { 
          success: true, 
          message: 'Delete synchronization completed successfully'
        }
      }
    })
    
    // API endpoint to get current deletion settings
    fastify.get('/api/admin/delete-sync/settings', {
      schema: {
        description: 'Get current delete sync settings',
        tags: ['Admin'],
        response: {
          200: {
            type: 'object',
            properties: {
              deleteMovie: { type: 'boolean' },
              deleteEndedShow: { type: 'boolean' },
              deleteContinuingShow: { type: 'boolean' },
              deleteFiles: { type: 'boolean' },
              deleteIntervalDays: { type: 'number' },
              nextScheduledRun: { type: 'string' }
            }
          }
        }
      },
      handler: async (request, reply) => {
        // Calculate the next scheduled run time
        const now = new Date()
        const nextRun = new Date(now.getTime() + intervalHours * 60 * 60 * 1000)
        
        return {
          deleteMovie: fastify.config.deleteMovie,
          deleteEndedShow: fastify.config.deleteEndedShow,
          deleteContinuingShow: fastify.config.deleteContinuingShow,
          deleteFiles: fastify.config.deleteFiles,
          deleteIntervalDays: fastify.config.deleteIntervalDays,
          nextScheduledRun: nextRun.toISOString()
        }
      }
    })
    
    fastify.log.info('Delete sync plugin initialized successfully')
  },
  {
    name: 'delete-sync-service',
    dependencies: ['scheduler', 'sonarr-manager', 'radarr-manager', 'database', 'config']
  }
)