import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import {
  ScheduleConfigSchema,
  JobStatusSchema,
  SuccessResponseSchema,
  DeleteSyncDryRunResponseSchema,
  ErrorResponseSchema,
  type ScheduleConfig,
} from '@schemas/scheduler/scheduler.schema.js'

const plugin: FastifyPluginAsync = async (fastify) => {
  // Get all job schedules
  fastify.get(
    '/schedules',
    {
      schema: {
        response: {
          200: z.array(JobStatusSchema),
        },
        tags: ['Scheduler'],
      },
    },
    async () => {
      return await fastify.db.getAllSchedules()
    },
  )

  // Get a specific job schedule
  fastify.get<{
    Params: { name: string }
  }>(
    '/schedules/:name',
    {
      schema: {
        params: z.object({ name: z.string() }),
        response: {
          200: JobStatusSchema,
          404: ErrorResponseSchema,
        },
        tags: ['Scheduler'],
      },
    },
    async (request, reply) => {
      const { name } = request.params
      const schedule = await fastify.db.getScheduleByName(name)

      if (!schedule) {
        reply.status(404)
        return { error: `Schedule "${name}" not found` }
      }

      return schedule
    },
  )

  // Create/update a job schedule
  fastify.post<{
    Body: ScheduleConfig
  }>(
    '/schedules',
    {
      schema: {
        body: ScheduleConfigSchema,
        response: {
          200: SuccessResponseSchema,
        },
        tags: ['Scheduler'],
      },
    },
    async (request, reply) => {
      const scheduleData = request.body
      const existing = await fastify.db.getScheduleByName(scheduleData.name)

      if (existing) {
        // Update existing
        await fastify.scheduler.updateJobSchedule(
          scheduleData.name,
          scheduleData.config,
          scheduleData.enabled,
        )
        return {
          success: true,
          message: `Schedule "${scheduleData.name}" updated`,
        }
      }

      // Create new
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
    },
  )

  // Update a job schedule
  fastify.put<{
    Params: { name: string }
    Body: Partial<Omit<ScheduleConfig, 'name'>>
  }>(
    '/schedules/:name',
    {
      schema: {
        params: z.object({ name: z.string() }),
        body: ScheduleConfigSchema.omit({ name: true }).partial(),
        response: {
          200: SuccessResponseSchema,
          404: ErrorResponseSchema,
          500: SuccessResponseSchema.extend({ success: z.literal(false) }),
        },
        tags: ['Scheduler'],
      },
    },
    async (request, reply) => {
      const { name } = request.params
      const updates = request.body

      const existing = await fastify.db.getScheduleByName(name)
      if (!existing) {
        reply.status(404)
        return { error: `Schedule "${name}" not found` }
      }

      const configToUpdate =
        updates.config === undefined ? null : updates.config

      const success = await fastify.scheduler.updateJobSchedule(
        name,
        configToUpdate,
        updates.enabled,
      )

      if (success) {
        return { success: true, message: `Schedule "${name}" updated` }
      }

      reply.status(500)
      return {
        success: false,
        message: `Failed to update schedule "${name}"`,
      }
    },
  )

  // Delete a job schedule
  fastify.delete<{
    Params: { name: string }
  }>(
    '/schedules/:name',
    {
      schema: {
        params: z.object({ name: z.string() }),
        response: {
          200: SuccessResponseSchema,
          404: ErrorResponseSchema,
          500: SuccessResponseSchema.extend({ success: z.literal(false) }),
        },
        tags: ['Scheduler'],
      },
    },
    async (request, reply) => {
      const { name } = request.params

      const existing = await fastify.db.getScheduleByName(name)
      if (!existing) {
        reply.status(404)
        return { error: `Schedule "${name}" not found` }
      }

      // Remove from scheduler
      await fastify.scheduler.unscheduleJob(name)

      // Delete from database
      const deleted = await fastify.db.deleteSchedule(name)

      if (deleted) {
        return { success: true, message: `Schedule "${name}" deleted` }
      }

      reply.status(500)
      return {
        success: false,
        message: `Failed to delete schedule "${name}"`,
      }
    },
  )

  // Run a job immediately
  fastify.post<{
    Params: { name: string }
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
      const { name } = request.params

      const existing = await fastify.db.getScheduleByName(name)
      if (!existing) {
        reply.status(404)
        return { error: `Schedule "${name}" not found` }
      }

      const success = await fastify.scheduler.runJobNow(name)

      if (success) {
        return { success: true, message: `Job "${name}" executed successfully` }
      }

      reply.status(500)
      return { error: `Failed to run job "${name}"` }
    },
  )

  // Enable/disable a job
  fastify.patch<{
    Params: { name: string }
    Body: { enabled: boolean }
  }>(
    '/schedules/:name/toggle',
    {
      schema: {
        params: z.object({ name: z.string() }),
        body: z.object({ enabled: z.boolean() }),
        response: {
          200: SuccessResponseSchema,
          404: ErrorResponseSchema,
          500: SuccessResponseSchema.extend({ success: z.literal(false) }),
        },
        tags: ['Scheduler'],
      },
    },
    async (request, reply) => {
      const { name } = request.params
      const { enabled } = request.body

      const existing = await fastify.db.getScheduleByName(name)
      if (!existing) {
        reply.status(404)
        return { error: `Schedule "${name}" not found` }
      }

      const success = await fastify.scheduler.updateJobSchedule(
        name,
        null,
        enabled,
      )

      if (success) {
        return {
          success: true,
          message: `Schedule "${name}" ${enabled ? 'enabled' : 'disabled'}`,
        }
      }

      reply.status(500)
      return {
        success: false,
        message: `Failed to ${enabled ? 'enable' : 'disable'} schedule "${name}"`,
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
        // Get the delete-sync job to make sure it exists
        const jobName = 'delete-sync'
        const schedule = await fastify.db.getScheduleByName(jobName)

        if (!schedule) {
          reply.status(404)
          return { error: `Schedule "${jobName}" not found` }
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
      } catch (error) {
        fastify.log.error('Error in delete sync dry run:', error)
        reply.status(500)
        return {
          error: `Failed to run delete sync dry run: ${error instanceof Error ? error.message : String(error)}`,
        }
      }
    },
  )
}

export default plugin
