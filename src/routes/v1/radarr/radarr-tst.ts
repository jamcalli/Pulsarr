import { ErrorSchema, NoContentSchema } from '@schemas/common/error.schema.js'
import { logRouteError } from '@utils/route-errors.js'
import type { FastifyPluginAsyncZodOpenApi } from 'fastify-zod-openapi'
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

const plugin: FastifyPluginAsyncZodOpenApi = async (fastify) => {
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
          204: NoContentSchema,
          400: ErrorSchema,
          401: ErrorSchema,
          404: ErrorSchema,
          500: ErrorSchema,
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
          // Clean up error message for user display
          const userMessage = error.message
            .replace(/Radarr API error: /, '')
            .replace(
              /Failed to initialize Radarr instance/,
              'Failed to save settings',
            )

          if (error.message.includes('Authentication')) {
            return reply.unauthorized(userMessage)
          }
          if (error.message.includes('not found')) {
            return reply.notFound(userMessage)
          }
          if (error.message.includes('default')) {
            return reply.badRequest(userMessage)
          }
          return reply.internalServerError(userMessage)
        }

        return reply.internalServerError(
          'An unexpected error occurred while updating the instance',
        )
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
          204: NoContentSchema,
          404: ErrorSchema,
          500: ErrorSchema,
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
          if (error.message.includes('not found')) {
            return reply.notFound(error.message)
          }
          return reply.internalServerError(error.message)
        }

        return reply.internalServerError(
          'An unknown error occurred when deleting the Radarr instance',
        )
      }
    },
  )
}

export default plugin
