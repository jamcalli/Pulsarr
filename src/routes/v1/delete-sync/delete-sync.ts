import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'

// Zod schema for delete sync settings
const DeleteSyncSettingsSchema = z.object({
  deleteMovie: z.boolean().optional(),
  deleteEndedShow: z.boolean().optional(),
  deleteContinuingShow: z.boolean().optional(),
  deleteFiles: z.boolean().optional(),
  deleteIntervalDays: z.number().int().positive().optional()
})

// Response schema for delete sync operation
const DeleteSyncResponseSchema = z.object({
  success: z.boolean(),
  message: z.string()
})

// Response schema for settings
const DeleteSyncSettingsResponseSchema = z.object({
  deleteMovie: z.boolean().nullable(),
  deleteEndedShow: z.boolean().nullable(),
  deleteContinuingShow: z.boolean().nullable(),
  deleteFiles: z.boolean().nullable(),
  deleteIntervalDays: z.number().nullable(),
  nextScheduledRun: z.string()
})

const plugin: FastifyPluginAsync = async (fastify) => {
  // Register admin API endpoint for manual triggering
  fastify.get<{
    Reply: z.infer<typeof DeleteSyncResponseSchema>
  }>(
    '/run',
    {
      schema: {
        description: 'Manually trigger a delete synchronization operation',
        tags: ['Admin'],
        response: {
          200: DeleteSyncResponseSchema
        }
      }
    },
    async (request, reply) => {
      fastify.log.info('Manually triggered delete sync via API')
      await fastify.deleteSync.run()
      return { 
        success: true, 
        message: 'Delete synchronization completed successfully'
      }
    }
  )
  
  // API endpoint to get current deletion settings
  fastify.get<{
    Reply: z.infer<typeof DeleteSyncSettingsResponseSchema>
  }>(
    '/settings',
    {
      schema: {
        description: 'Get current delete sync settings',
        tags: ['Admin'],
        response: {
          200: DeleteSyncSettingsResponseSchema
        }
      }
    },
    async (request, reply) => {
      // Calculate the next scheduled run time
      const intervalDays = fastify.config.deleteIntervalDays || 7
      const intervalHours = intervalDays * 24
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
  )

  // Update deletion settings
  fastify.put<{
    Body: z.infer<typeof DeleteSyncSettingsSchema>
    Reply: z.infer<typeof DeleteSyncSettingsResponseSchema>
  }>(
    '/settings',
    {
      schema: {
        description: 'Update delete sync settings',
        tags: ['Admin'],
        body: DeleteSyncSettingsSchema,
        response: {
          200: DeleteSyncSettingsResponseSchema
        }
      }
    },
    async (request, reply) => {
      const settings = request.body;
      
      // Update the configuration in the database
      await fastify.db.updateConfig(1, settings);
      
      // Update the in-memory config
      await fastify.updateConfig(settings);
      
      // Calculate the next scheduled run time
      const intervalDays = settings.deleteIntervalDays || fastify.config.deleteIntervalDays || 7;
      const intervalHours = intervalDays * 24;
      const now = new Date();
      const nextRun = new Date(now.getTime() + intervalHours * 60 * 60 * 1000);
      
      // Return updated settings
      return {
        deleteMovie: fastify.config.deleteMovie,
        deleteEndedShow: fastify.config.deleteEndedShow,
        deleteContinuingShow: fastify.config.deleteContinuingShow,
        deleteFiles: fastify.config.deleteFiles,
        deleteIntervalDays: fastify.config.deleteIntervalDays,
        nextScheduledRun: nextRun.toISOString()
      };
    }
  )
}

export default plugin