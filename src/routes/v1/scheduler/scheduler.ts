import { MessageResponseSchema } from '@schemas/common/message.schema.js'
import {
  DeleteSyncDryRunResponseSchema,
  DeleteSyncDryRunStatusSchema,
  ErrorResponseSchema,
  JobStatusSchema,
  ScheduleConfigSchema,
  type ScheduleUpdate,
  ScheduleUpdateSchema,
  SuccessResponseSchema,
} from '@schemas/scheduler/scheduler.schema.js'
import { logRouteError } from '@utils/route-errors.js'
import type { FastifyPluginAsyncZodOpenApi } from 'fastify-zod-openapi'
import { z } from 'zod'

const plugin: FastifyPluginAsyncZodOpenApi = async (fastify) => {
  // Get all job schedules
  fastify.get(
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
        return await fastify.scheduler.getSchedules()
      } catch (error) {
        logRouteError(fastify.log, request, error, {
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
        const schedule = await fastify.scheduler.getSchedule(name)

        if (!schedule) {
          return reply.notFound(`Schedule "${name}" not found`)
        }

        return schedule
      } catch (error) {
        logRouteError(fastify.log, request, error, {
          message: 'Failed to fetch schedule',
          scheduleName: request.params.name,
        })
        return reply.internalServerError('Unable to fetch schedule')
      }
    },
  )

  // Create or update a job schedule
  fastify.post(
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
      } catch (error) {
        logRouteError(fastify.log, request, error, {
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
      } catch (error) {
        logRouteError(fastify.log, request, error, {
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

        await fastify.scheduler.unscheduleJob(name)
        const deleted = await fastify.db.deleteSchedule(name)
        if (!deleted) {
          return reply.internalServerError(
            `Failed to delete schedule "${name}"`,
          )
        }

        return { success: true, message: `Schedule "${name}" deleted` }
      } catch (error) {
        logRouteError(fastify.log, request, error, {
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
        description:
          'Execute a scheduled job immediately. Holds the request open for the whole run, so use POST /v1/scheduler/schedules/{name}/start instead.',
        deprecated: true,
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
      } catch (error) {
        logRouteError(fastify.log, request, error, {
          message: 'Failed to run job',
          jobName: request.params.name,
        })
        return reply.internalServerError('Unable to run job')
      }
    },
  )

  // Start a job in the background
  fastify.post<{
    Params: { name: string }
  }>(
    '/schedules/:name/start',
    {
      schema: {
        summary: 'Start job in the background',
        operationId: 'startJob',
        description:
          'Starts a scheduled job outside its schedule and returns at once. The schedule row reports running and the outcome in last_run.',
        params: z.object({ name: z.string() }),
        response: {
          202: MessageResponseSchema,
          404: ErrorResponseSchema,
          409: ErrorResponseSchema,
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

        const outcome = fastify.scheduler.startJob(name)
        if (outcome === 'unknown') {
          return reply.notFound(`Job "${name}" has no handler`)
        }
        if (outcome === 'running') {
          return reply.conflict(`Job "${name}" is already running`)
        }

        return reply.status(202).send({ message: `Job "${name}" started` })
      } catch (error) {
        logRouteError(fastify.log, request, error, {
          message: 'Failed to start job',
          jobName: request.params.name,
        })
        return reply.internalServerError('Unable to start job')
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
      } catch (error) {
        logRouteError(fastify.log, request, error, {
          message: 'Failed to toggle schedule status',
          scheduleName: request.params.name,
          enabled: request.body.enabled,
        })
        return reply.internalServerError('Unable to toggle schedule status')
      }
    },
  )

  // Dry-run the delete sync job
  fastify.post(
    '/schedules/delete-sync/dry-run',
    {
      schema: {
        summary: 'Dry-run delete sync',
        operationId: 'dryRunDeleteSync',
        description:
          'Perform a dry-run of the delete sync job to preview what would be deleted. Holds the request open for the whole run, so use POST /v1/scheduler/schedules/delete-sync/dry-run/start instead.',
        deprecated: true,
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

        return await fastify.deleteSync.runDryRun()
      } catch (error) {
        logRouteError(fastify.log, request, error, {
          message: 'Failed to run delete sync dry run',
        })
        return reply.internalServerError('Failed to run delete sync dry run')
      }
    },
  )

  // Start a delete sync dry run in the background
  fastify.post(
    '/schedules/delete-sync/dry-run/start',
    {
      schema: {
        summary: 'Start delete sync dry run',
        operationId: 'startDeleteSyncDryRun',
        description:
          'Starts a delete sync dry run in the background and returns at once. Read the dry run status route for the outcome.',
        response: {
          202: MessageResponseSchema,
          404: ErrorResponseSchema,
          409: ErrorResponseSchema,
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

        if (!fastify.deleteSync.startDryRun()) {
          return reply.conflict('A delete sync is already running')
        }

        return reply
          .status(202)
          .send({ message: 'Delete sync dry run started' })
      } catch (error) {
        logRouteError(fastify.log, request, error, {
          message: 'Failed to start delete sync dry run',
        })
        return reply.internalServerError('Unable to start delete sync dry run')
      }
    },
  )

  // Get the latest delete sync dry run
  fastify.get(
    '/schedules/delete-sync/dry-run/status',
    {
      schema: {
        summary: 'Get delete sync dry run status',
        operationId: 'getDeleteSyncDryRunStatus',
        description:
          'Whether a delete sync dry run is running and how the latest one ended. Resets when the server restarts.',
        response: {
          200: DeleteSyncDryRunStatusSchema,
          500: ErrorResponseSchema,
        },
        tags: ['Scheduler'],
      },
    },
    async () => fastify.deleteSync.dryRunStatus(),
  )
}

export default plugin
