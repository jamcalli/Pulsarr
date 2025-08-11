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
  createSeasonFolders: z.boolean().optional().default(false),
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
        fastify.log.error({ error }, 'Error updating Sonarr instance:')

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
            .replace(/Sonarr API error: /, '')
            .replace(
              /Failed to initialize Sonarr instance/,
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
          reply.status(500).send({
            statusCode: 500,
            error: 'Internal Server Error',
            message: 'An unexpected error occurred while updating the instance',
          })
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
        summary: 'Delete Sonarr instance',
        operationId: 'deleteSonarrInstance',
        description: 'Delete a Sonarr instance configuration',
        params: z.object({ id: z.coerce.number() }),
        tags: ['Sonarr'],
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
