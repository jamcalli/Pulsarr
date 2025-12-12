import { ErrorSchema, NoContentSchema } from '@schemas/common/error.schema.js'
import { logRouteError } from '@utils/route-errors.js'
import type { FastifyPluginAsyncZodOpenApi } from 'fastify-zod-openapi'
import { z } from 'zod'

// Zod schema for Sonarr instance configuration
const SonarrInstanceSchema = z.object({
  name: z.string().min(1, { error: 'Name is required' }),
  baseUrl: z.string().url({ error: 'Invalid base URL' }),
  apiKey: z.string().min(1, { error: 'API Key is required' }),
  qualityProfile: z.union([z.string(), z.number()]).nullish(),
  rootFolder: z.string().nullish(),
  bypassIgnored: z.boolean().optional().default(false),
  seasonMonitoring: z.string().optional().default('all'),
  monitorNewItems: z.enum(['all', 'none']).default('all'),
  searchOnAdd: z.boolean().optional().default(true),
  createSeasonFolders: z.boolean().optional().default(false),
  tags: z.array(z.string()).optional().default([]),
  isDefault: z.boolean().optional().default(false),
  syncedInstances: z.array(z.number()).optional(),
  seriesType: z
    .enum(['standard', 'anime', 'daily'])
    .optional()
    .default('standard'),
})

const plugin: FastifyPluginAsyncZodOpenApi = async (fastify) => {
  // Get all instances
  fastify.get<{
    Reply: Array<z.infer<typeof SonarrInstanceSchema> & { id: number }>
  }>(
    '/instances',
    {
      schema: {
        summary: 'Get Sonarr instances',
        operationId: 'getSonarrInstances',
        description: 'Retrieve all configured Sonarr instances',
        response: {
          200: z.array(SonarrInstanceSchema.extend({ id: z.number() })),
        },
        tags: ['Sonarr'],
      },
    },
    async () => {
      const instances = await fastify.sonarrManager.getAllInstances()
      // Ensure searchOnAdd and seriesType are defined for all instances
      return instances.map((instance) => ({
        ...instance,
        searchOnAdd: instance.searchOnAdd ?? true,
        createSeasonFolders: instance.createSeasonFolders ?? false,
        seriesType: instance.seriesType ?? 'standard',
        tags: (instance.tags ?? []).map((t) => t.toString()),
      }))
    },
  )

  // Create instance
  fastify.post<{
    Body: z.infer<typeof SonarrInstanceSchema>
    Reply: { id: number }
  }>(
    '/instances',
    {
      schema: {
        summary: 'Create Sonarr instance',
        operationId: 'createSonarrInstance',
        description: 'Create a new Sonarr instance configuration',
        body: SonarrInstanceSchema,
        response: {
          201: z.object({ id: z.number().int().positive() }),
        },
        tags: ['Sonarr'],
      },
    },
    async (request, reply) => {
      const instanceData = request.body
      const id = await fastify.sonarrManager.addInstance(instanceData)

      reply.status(201)
      return { id }
    },
  )

  // Update instance
  fastify.put<{
    Params: { id: number }
    Body: Partial<z.infer<typeof SonarrInstanceSchema>>
  }>(
    '/instances/:id',
    {
      schema: {
        summary: 'Update Sonarr instance',
        operationId: 'updateSonarrInstance',
        description: 'Update an existing Sonarr instance configuration',
        params: z.object({ id: z.coerce.number() }),
        body: SonarrInstanceSchema.partial(),
        tags: ['Sonarr'],
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
        await fastify.sonarrManager.updateInstance(id, updates)
        reply.status(204)
      } catch (error) {
        logRouteError(fastify.log, request, error, {
          message: 'Error updating instance',
          context: {
            service: 'sonarr',
            instanceId: request.params.id,
          },
        })

        if (error instanceof Error) {
          // Clean up error message for user display
          const userMessage = error.message
            .replace(/Sonarr API error: /, '')
            .replace(
              /Failed to initialize Sonarr instance/,
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
        summary: 'Delete Sonarr instance',
        operationId: 'deleteSonarrInstance',
        description: 'Delete a Sonarr instance configuration',
        params: z.object({ id: z.coerce.number() }),
        tags: ['Sonarr'],
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
        await fastify.sonarrManager.removeInstance(id)
        reply.status(204)
      } catch (error) {
        if (error instanceof Error) {
          if (error.message.includes('not found')) {
            return reply.notFound(error.message)
          }
          return reply.internalServerError(error.message)
        }

        return reply.internalServerError(
          'An unknown error occurred when deleting the Sonarr instance',
        )
      }
    },
  )
}

export default plugin
