import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import {
  ScheduleConfigSchema,
  ScheduleUpdateSchema,
  JobStatusSchema,
  SuccessResponseSchema,
  DeleteSyncDryRunResponseSchema,
  ErrorResponseSchema,
  type ScheduleConfig,
  type ScheduleUpdate,
} from '@schemas/scheduler/scheduler.schema.js'

const plugin: FastifyPluginAsync = async (fastify) => {
  // Get all job schedules
  fastify.get<{
    Reply: z.infer<typeof JobStatusSchema>[]
  }>(
    '/schedules',
    {
      schema: {
        response: {
          200: z.array(JobStatusSchema),
          500: ErrorResponseSchema,
        },
        tags: ['Scheduler'],
      },
    },
    async (request, reply) => {
      try {
        return await fastify.db.getAllSchedules()
      } catch (err) {
        fastify.log.error('Error fetching schedules:', err)
        throw reply.internalServerError('Unable to fetch schedules')
      }
    },
  )

  // Get a specific job schedule
  fastify.get<{
    Params: { name: string }
    Reply: z.infer<typeof JobStatusSchema> | z.infer<typeof ErrorResponseSchema>
  }>(
    '/schedules/:name',
    {
      schema: {
        params: z.object({ name: z.string() }),
        response: {
          200: JobStatusSchema,
          404: ErrorResponseSchema,
          500: ErrorResponseSchema,
        },
        tags: ['Scheduler'],
      },
    },
    async (request, reply) => {
      try {
        const { name } = request.params
        const schedule = await fastify.db.getScheduleByName(name)

        if (!schedule) {
          throw reply.notFound(`Schedule "${name}" not found`)
        }

        return schedule
      } catch (err) {
        if (err instanceof Error && 'statusCode' in err) {
          throw err
        }

        fastify.log.error('Error fetching schedule:', err)
        throw reply.internalServerError('Unable to fetch schedule')
      }
    },
  )

  // Create/update a job schedule
  fastify.post<{
    Body: ScheduleConfig
    Reply:
      | z.infer<typeof SuccessResponseSchema>
      | z.infer<typeof ErrorResponseSchema>
  }>(
    '/schedules',
    {
      schema: {
        body: ScheduleConfigSchema,
        response: {
          200: SuccessResponseSchema,
          500: ErrorResponseSchema,
        },
        tags: ['Scheduler'],
      },
    },
    async (request, reply) => {
      try {
        const scheduleData = request.body
        const existing = await fastify.db.getScheduleByName(scheduleData.name)

        if (existing) {
          // Update existing
          const success = await fastify.scheduler.updateJobSchedule(
            scheduleData.name,
            scheduleData.config,
            scheduleData.enabled,
          )

          if (!success) {
            throw reply.internalServerError(
              `Failed to update schedule "${scheduleData.name}"`,
            )
          }

          return {
            success: true,
            message: `Schedule "${scheduleData.name}" updated`,
          }
        }

        // Create new
        try {
          await fastify.db.createSchedule({
            name: scheduleData.name,
            type: scheduleData.type,
            config: scheduleData.config,
            enabled: scheduleData.enabled,
            last_run: null,
            next_run: null,
          })
          return {
            success: true,
            message: `Schedule "${scheduleData.name}" created`,
          }
        } catch (error) {
          fastify.log.error('Error creating schedule:', error)
          throw reply.internalServerError(
            `Failed to create schedule "${scheduleData.name}"`,
          )
        }
      } catch (err) {
        if (err instanceof Error && 'statusCode' in err) {
          throw err
        }

        fastify.log.error('Error processing schedule:', err)
        throw reply.internalServerError('Unable to process schedule request')
      }
    },
  )

  // Update a job schedule
  fastify.put<{
    Params: { name: string }
    Body: ScheduleUpdate
    Reply:
      | z.infer<typeof SuccessResponseSchema>
      | z.infer<typeof ErrorResponseSchema>
  }>(
    '/schedules/:name',
    {
      schema: {
        params: z.object({ name: z.string() }),
        body: ScheduleUpdateSchema,
        response: {
          200: SuccessResponseSchema,
          404: ErrorResponseSchema,
          500: ErrorResponseSchema,
        },
        tags: ['Scheduler'],
      },
    },
    async (request, reply) => {
      try {
        const { name } = request.params
        const updates = request.body

        const existing = await fastify.db.getScheduleByName(name)
        if (!existing) {
          throw reply.notFound(`Schedule "${name}" not found`)
        }

        const configToUpdate =
          updates.config === undefined ? null : updates.config
        const success = await fastify.scheduler.updateJobSchedule(
          name,
          configToUpdate,
          updates.enabled,
        )

        if (!success) {
          throw reply.internalServerError(`Failed to update schedule "${name}"`)
        }

        return { success: true, message: `Schedule "${name}" updated` }
      } catch (err) {
        if (err instanceof Error && 'statusCode' in err) {
          throw err
        }

        fastify.log.error('Error updating schedule:', err)
        throw reply.internalServerError('Unable to update schedule')
      }
    },
  )

  // Delete a job schedule
  fastify.delete<{
    Params: { name: string }
    Reply:
      | z.infer<typeof SuccessResponseSchema>
      | z.infer<typeof ErrorResponseSchema>
  }>(
    '/schedules/:name',
    {
      schema: {
        params: z.object({ name: z.string() }),
        response: {
          200: SuccessResponseSchema,
          404: ErrorResponseSchema,
          500: ErrorResponseSchema,
        },
        tags: ['Scheduler'],
      },
    },
    async (request, reply) => {
      try {
        const { name } = request.params

        const existing = await fastify.db.getScheduleByName(name)
        if (!existing) {
          throw reply.notFound(`Schedule "${name}" not found`)
        }

        // Remove from scheduler
        await fastify.scheduler.unscheduleJob(name)

        // Delete from database
        const deleted = await fastify.db.deleteSchedule(name)
        if (!deleted) {
          throw reply.internalServerError(`Failed to delete schedule "${name}"`)
        }

        return { success: true, message: `Schedule "${name}" deleted` }
      } catch (err) {
        if (err instanceof Error && 'statusCode' in err) {
          throw err
        }

        fastify.log.error('Error deleting schedule:', err)
        throw reply.internalServerError('Unable to delete schedule')
      }
    },
  )

  // Run a job immediately
  fastify.post<{
    Params: { name: string }
    Reply:
      | z.infer<typeof SuccessResponseSchema>
      | z.infer<typeof ErrorResponseSchema>
  }>(
    '/schedules/:name/run',
    {
      schema: {
        params: z.object({ name: z.string() }),
        response: {
          200: SuccessResponseSchema,
          404: ErrorResponseSchema,
          500: ErrorResponseSchema,
        },
        tags: ['Scheduler'],
      },
    },
    async (request, reply) => {
      try {
        const { name } = request.params

        const existing = await fastify.db.getScheduleByName(name)
        if (!existing) {
          throw reply.notFound(`Schedule "${name}" not found`)
        }

        const success = await fastify.scheduler.runJobNow(name)
        if (!success) {
          throw reply.internalServerError(`Failed to run job "${name}"`)
        }

        return { success: true, message: `Job "${name}" executed successfully` }
      } catch (err) {
        if (err instanceof Error && 'statusCode' in err) {
          throw err
        }

        fastify.log.error('Error running job:', err)
        throw reply.internalServerError('Unable to run job')
      }
    },
  )

  // Enable/disable a job
  fastify.patch<{
    Params: { name: string }
    Body: { enabled: boolean }
    Reply:
      | z.infer<typeof SuccessResponseSchema>
      | z.infer<typeof ErrorResponseSchema>
  }>(
    '/schedules/:name/toggle',
    {
      schema: {
        params: z.object({ name: z.string() }),
        body: z.object({ enabled: z.boolean() }),
        response: {
          200: SuccessResponseSchema,
          404: ErrorResponseSchema,
          500: ErrorResponseSchema,
        },
        tags: ['Scheduler'],
      },
    },
    async (request, reply) => {
      try {
        const { name } = request.params
        const { enabled } = request.body

        const existing = await fastify.db.getScheduleByName(name)
        if (!existing) {
          throw reply.notFound(`Schedule "${name}" not found`)
        }

        const success = await fastify.scheduler.updateJobSchedule(
          name,
          null,
          enabled,
        )

        if (!success) {
          throw reply.internalServerError(
            `Failed to ${enabled ? 'enable' : 'disable'} schedule "${name}"`,
          )
        }

        return {
          success: true,
          message: `Schedule "${name}" ${enabled ? 'enabled' : 'disabled'}`,
        }
      } catch (err) {
        if (err instanceof Error && 'statusCode' in err) {
          throw err
        }

        fastify.log.error('Error toggling schedule status:', err)
        throw reply.internalServerError('Unable to toggle schedule status')
      }
    },
  )

  // Dry-run the delete sync job
  fastify.post<{
    Reply:
      | z.infer<typeof DeleteSyncDryRunResponseSchema>
      | z.infer<typeof ErrorResponseSchema>
  }>(
    '/schedules/delete-sync/dry-run',
    {
      schema: {
        response: {
          200: DeleteSyncDryRunResponseSchema,
          404: ErrorResponseSchema,
          500: ErrorResponseSchema,
        },
        tags: ['Scheduler'],
      },
    },
    async (_request, reply) => {
      try {
        const jobName = 'delete-sync'
        const schedule = await fastify.db.getScheduleByName(jobName)

        if (!schedule) {
          throw reply.notFound(`Schedule "${jobName}" not found`)
        }

        // Run the delete sync in dry run mode
        const results = await fastify.deleteSync.run(true)

        // Handle safety checks if your service returns them
        const safetyTriggered =
          'safetyTriggered' in results && results.safetyTriggered
        const safetyMessage =
          'safetyMessage' in results ? results.safetyMessage : undefined

        let message = ''
        if (safetyTriggered) {
          message = `Delete sync dry run aborted: ${safetyMessage || 'Safety check triggered'}`
        } else {
          message = `Delete sync dry run completed: Would delete ${results.total.deleted} items (${results.movies.deleted} movies, ${results.shows.deleted} shows)`
        }

        return {
          success: true,
          message,
          results,
        }
      } catch (err) {
        if (err instanceof Error && 'statusCode' in err) {
          throw err
        }

        fastify.log.error('Error in delete sync dry run:', err)
        throw reply.internalServerError('Failed to run delete sync dry run')
      }
    },
  )
}

export default plugin
