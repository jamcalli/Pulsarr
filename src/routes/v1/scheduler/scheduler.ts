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
import { logRouteError } from '@utils/route-errors.js'

const plugin: FastifyPluginAsync = async (fastify) => {
  // Get all job schedules
  fastify.get<{
    Reply: z.infer<typeof JobStatusSchema>[]
  }>(
    '/schedules',
    {
      schema: {
        summary: 'Get all job schedules',
        operationId: 'getAllSchedules',
        description: 'Retrieve all configured job schedules and their status',
        response: {
          200: z.array(JobStatusSchema),
          500: ErrorResponseSchema,
        },
        tags: ['Scheduler'],
      },
    },
    async (request, reply) => {
      try {
        const schedules = await fastify.db.getAllSchedules()
        return schedules
      } catch (err) {
        logRouteError(fastify.log, request, err, {
          message: 'Failed to fetch schedules',
        })
        return reply.internalServerError('Unable to fetch schedules')
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
        summary: 'Get job schedule by name',
        operationId: 'getScheduleByName',
        description: 'Retrieve a specific job schedule by its name',
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
          return reply.notFound(`Schedule "${name}" not found`)
        }

        return schedule
      } catch (err) {
        if (err instanceof Error && 'statusCode' in err) {
          throw err
        }

        logRouteError(fastify.log, request, err, {
          message: 'Failed to fetch schedule',
          scheduleName: request.params.name,
        })
        return reply.internalServerError('Unable to fetch schedule')
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
        summary: 'Create job schedule',
        operationId: 'createSchedule',
        description: 'Create a new job schedule or update an existing one',
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
            return reply.internalServerError(
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
          logRouteError(fastify.log, request, error, {
            message: 'Failed to create schedule',
            scheduleName: scheduleData.name,
          })
          return reply.internalServerError(
            `Failed to create schedule "${scheduleData.name}"`,
          )
        }
      } catch (err) {
        if (err instanceof Error && 'statusCode' in err) {
          throw err
        }

        logRouteError(fastify.log, request, err, {
          message: 'Failed to process schedule request',
        })
        return reply.internalServerError('Unable to process schedule request')
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
        summary: 'Update job schedule',
        operationId: 'updateSchedule',
        description: 'Update an existing job schedule configuration',
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
          return reply.notFound(`Schedule "${name}" not found`)
        }

        const configToUpdate =
          updates.config === undefined ? null : updates.config
        const success = await fastify.scheduler.updateJobSchedule(
          name,
          configToUpdate,
          updates.enabled,
        )

        if (!success) {
          return reply.internalServerError(
            `Failed to update schedule "${name}"`,
          )
        }

        return { success: true, message: `Schedule "${name}" updated` }
      } catch (err) {
        if (err instanceof Error && 'statusCode' in err) {
          throw err
        }

        logRouteError(fastify.log, request, err, {
          message: 'Failed to update schedule',
          scheduleName: request.params.name,
        })
        return reply.internalServerError('Unable to update schedule')
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
        summary: 'Delete job schedule',
        operationId: 'deleteSchedule',
        description: 'Delete a job schedule by its name',
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
          return reply.notFound(`Schedule "${name}" not found`)
        }

        // Remove from scheduler
        await fastify.scheduler.unscheduleJob(name)

        // Delete from database
        const deleted = await fastify.db.deleteSchedule(name)
        if (!deleted) {
          return reply.internalServerError(
            `Failed to delete schedule "${name}"`,
          )
        }

        return { success: true, message: `Schedule "${name}" deleted` }
      } catch (err) {
        if (err instanceof Error && 'statusCode' in err) {
          throw err
        }

        logRouteError(fastify.log, request, err, {
          message: 'Failed to delete schedule',
          scheduleName: request.params.name,
        })
        return reply.internalServerError('Unable to delete schedule')
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
        summary: 'Run job immediately',
        operationId: 'runJobNow',
        description: 'Execute a scheduled job immediately',
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
          return reply.notFound(`Schedule "${name}" not found`)
        }

        const success = await fastify.scheduler.runJobNow(name)
        if (!success) {
          return reply.internalServerError(`Failed to run job "${name}"`)
        }

        return { success: true, message: `Job "${name}" executed successfully` }
      } catch (err) {
        if (err instanceof Error && 'statusCode' in err) {
          throw err
        }

        logRouteError(fastify.log, request, err, {
          message: 'Failed to run job',
          jobName: request.params.name,
        })
        return reply.internalServerError('Unable to run job')
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
        summary: 'Toggle job schedule',
        operationId: 'toggleSchedule',
        description: 'Enable or disable a job schedule',
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
          return reply.notFound(`Schedule "${name}" not found`)
        }

        const success = await fastify.scheduler.updateJobSchedule(
          name,
          null,
          enabled,
        )

        if (!success) {
          return reply.internalServerError(
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

        logRouteError(fastify.log, request, err, {
          message: 'Failed to toggle schedule status',
          scheduleName: request.params.name,
          enabled: request.body.enabled,
        })
        return reply.internalServerError('Unable to toggle schedule status')
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
        summary: 'Dry-run delete sync',
        operationId: 'dryRunDeleteSync',
        description:
          'Perform a dry-run of the delete sync job to preview what would be deleted',
        response: {
          200: DeleteSyncDryRunResponseSchema,
          404: ErrorResponseSchema,
          500: ErrorResponseSchema,
        },
        tags: ['Scheduler'],
      },
    },
    async (request, reply) => {
      try {
        const jobName = 'delete-sync'
        const schedule = await fastify.db.getScheduleByName(jobName)

        if (!schedule) {
          return reply.notFound(`Schedule "${jobName}" not found`)
        }

        // Run the delete sync in dry run mode
        const results = await fastify.deleteSync.run(true)

        // Handle safety checks
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

        logRouteError(fastify.log, request, err, {
          message: 'Failed to run delete sync dry run',
        })
        return reply.internalServerError('Failed to run delete sync dry run')
      }
    },
  )
}

export default plugin
