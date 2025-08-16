import { logRouteError } from '@utils/route-errors.js'
import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'

// Zod schema for Radarr instance configuration
const RadarrInstanceSchema = z.object({
  name: z.string().min(1, { error: 'Name is required' }),
  baseUrl: z.string().url({ error: 'Invalid base URL' }),
  apiKey: z.string().min(1, { error: 'API Key is required' }),
  qualityProfile: z.union([z.string(), z.number()]).nullish(),
  rootFolder: z.string().nullish(),
  bypassIgnored: z.boolean().optional().default(false),
  searchOnAdd: z.boolean().optional().default(true),
  minimumAvailability: z
    .enum(['announced', 'inCinemas', 'released'])
    .optional()
    .default('released'),
  tags: z.array(z.string()).optional().default([]),
  isDefault: z.boolean().optional().default(false),
  syncedInstances: z.array(z.number()).optional(),
})

const plugin: FastifyPluginAsync = async (fastify) => {
  // Get all instances
  fastify.get<{
    Reply: Array<z.infer<typeof RadarrInstanceSchema> & { id: number }>
  }>(
    '/instances',
    {
      schema: {
        summary: 'Get Radarr instances',
        operationId: 'getRadarrInstances',
        description: 'Retrieve all configured Radarr instances',
        response: {
          200: z.array(RadarrInstanceSchema.extend({ id: z.number() })),
        },
        tags: ['Radarr'],
      },
    },
    async () => {
      const instances = await fastify.radarrManager.getAllInstances()
      // Ensure defaults are provided for all instances
      return instances.map((instance) => ({
        ...instance,
        searchOnAdd: instance.searchOnAdd ?? true,
        minimumAvailability: instance.minimumAvailability ?? 'released',
        tags: (instance.tags ?? []).map((t) => t.toString()),
      }))
    },
  )

  // Create instance
  fastify.post<{
    Body: z.infer<typeof RadarrInstanceSchema>
    Reply: { id: number }
  }>(
    '/instances',
    {
      schema: {
        summary: 'Create Radarr instance',
        operationId: 'createRadarrInstance',
        description: 'Create a new Radarr instance configuration',
        body: RadarrInstanceSchema,
        response: {
          201: z.object({ id: z.number().int().positive() }),
        },
        tags: ['Radarr'],
      },
    },
    async (request, reply) => {
      const instanceData = request.body
      const id = await fastify.radarrManager.addInstance(instanceData)
      reply.status(201)
      return { id }
    },
  )

  // Update instance
  fastify.put<{
    Params: { id: number }
    Body: Partial<z.infer<typeof RadarrInstanceSchema>>
  }>(
    '/instances/:id',
    {
      schema: {
        summary: 'Update Radarr instance',
        operationId: 'updateRadarrInstance',
        description: 'Update an existing Radarr instance configuration',
        params: z.object({ id: z.coerce.number() }),
        body: RadarrInstanceSchema.partial(),
        tags: ['Radarr'],
        response: {
          204: z.void(),
          400: z.object({
            statusCode: z.number(),
            error: z.string(),
            message: z.string(),
          }),
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params
      const updates = request.body

      try {
        await fastify.radarrManager.updateInstance(id, updates)
        reply.status(204)
      } catch (error) {
        logRouteError(fastify.log, request, error, {
          message: 'Error updating instance',
          context: {
            service: 'radarr',
            instanceId: request.params.id,
          },
        })

        if (error instanceof Error) {
          const statusCode = error.message.includes('Authentication')
            ? 401
            : error.message.includes('not found')
              ? 404
              : error.message.includes('default')
                ? 400
                : 500

          // Extract clean error message for user display
          let userMessage = error.message

          // Clean up error messages
          userMessage = userMessage
            .replace(/Radarr API error: /, '')
            .replace(
              /Failed to initialize Radarr instance/,
              'Failed to save settings',
            )

          reply
            .status(statusCode)
            .header('Content-Type', 'application/json; charset=utf-8')
            .send({
              statusCode,
              error:
                statusCode === 400
                  ? 'Bad Request'
                  : statusCode === 401
                    ? 'Unauthorized'
                    : statusCode === 404
                      ? 'Not Found'
                      : 'Internal Server Error',
              message: userMessage,
            })
        } else {
          reply.internalServerError(
            'An unexpected error occurred while updating the instance',
          )
        }
      }
    },
  )

  // Delete instance
  fastify.delete<{
    Params: { id: number }
  }>(
    '/instances/:id',
    {
      schema: {
        summary: 'Delete Radarr instance',
        operationId: 'deleteRadarrInstance',
        description: 'Delete a Radarr instance configuration',
        params: z.object({ id: z.coerce.number() }),
        tags: ['Radarr'],
        response: {
          204: z.void(),
          400: z.object({
            statusCode: z.number(),
            error: z.string(),
            message: z.string(),
          }),
          500: z.object({
            statusCode: z.number(),
            error: z.string(),
            message: z.string(),
          }),
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params

      try {
        await fastify.radarrManager.removeInstance(id)
        reply.status(204)
      } catch (error) {
        if (error instanceof Error) {
          const statusCode = error.message.includes('not found') ? 400 : 500
          const errorType =
            statusCode === 400 ? 'Bad Request' : 'Internal Server Error'

          reply
            .status(statusCode)
            .header('Content-Type', 'application/json; charset=utf-8')
            .send({
              statusCode,
              error: errorType,
              message: error.message,
            })
        } else {
          reply
            .status(500)
            .header('Content-Type', 'application/json; charset=utf-8')
            .send({
              statusCode: 500,
              error: 'Internal Server Error',
              message:
                'An unknown error occurred when deleting the Radarr instance',
            })
        }
      }
    },
  )
}

export default plugin
