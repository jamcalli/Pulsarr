import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { DefaultInstanceError } from '@root/types/errors.js'

// Zod schema for Sonarr instance configuration
const SonarrInstanceSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  baseUrl: z.string().url({ message: 'Invalid base URL' }),
  apiKey: z.string().min(1, { message: 'API Key is required' }),
  qualityProfile: z.union([z.string(), z.number()]).nullish(),
  rootFolder: z.string().nullish(),
  bypassIgnored: z.boolean().optional().default(false),
  seasonMonitoring: z.string().optional().default('all'),
  monitorNewItems: z.enum(['all', 'none']).default('all'),
  searchOnAdd: z.boolean().optional().default(true),
  tags: z.array(z.string()).optional().default([]),
  isDefault: z.boolean().optional().default(false),
  syncedInstances: z.array(z.number()).optional(),
  seriesType: z
    .enum(['standard', 'anime', 'daily'])
    .optional()
    .default('standard'),
})

const plugin: FastifyPluginAsync = async (fastify) => {
  // Get all instances
  fastify.get<{
    Reply: Array<z.infer<typeof SonarrInstanceSchema> & { id: number }>
  }>(
    '/instances',
    {
      schema: {
        response: {
          200: z.array(SonarrInstanceSchema.extend({ id: z.number() })),
        },
        tags: ['Sonarr Configuration'],
      },
    },
    async () => {
      const instances = await fastify.sonarrManager.getAllInstances()
      // Ensure searchOnAdd and seriesType are defined for all instances
      return instances.map((instance) => ({
        ...instance,
        searchOnAdd: instance.searchOnAdd ?? true,
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
        body: SonarrInstanceSchema,
        response: {
          201: z.object({ id: z.number().int().positive() }),
        },
        tags: ['Sonarr Configuration'],
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
        params: z.object({ id: z.coerce.number() }),
        body: SonarrInstanceSchema.partial(),
        tags: ['Sonarr Configuration'],
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
        await fastify.sonarrManager.updateInstance(id, updates)
        reply.status(204)
      } catch (error) {
        fastify.log.debug('Caught error in sonarr route handler:', {
          error,
          type: error instanceof Error ? error.constructor.name : typeof error,
          message: error instanceof Error ? error.message : String(error),
          isDefaultError: error instanceof DefaultInstanceError,
        })

        // Special handling for default instance errors
        if (
          error instanceof DefaultInstanceError ||
          (error instanceof Error && error.message.includes('default'))
        ) {
          // Handle the specific case where default status can't be removed
          reply
            .status(400)
            .header('Content-Type', 'application/json; charset=utf-8')
            .send({
              statusCode: 400,
              error: 'Bad Request',
              message: error.message,
            })
        } else {
          // Rethrow for generic error handling
          throw error
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
        params: z.object({ id: z.coerce.number() }),
        tags: ['Sonarr Configuration'],
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
        await fastify.sonarrManager.removeInstance(id)
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
                'An unknown error occurred when deleting the Sonarr instance',
            })
        }
      }
    },
  )
}

export default plugin
