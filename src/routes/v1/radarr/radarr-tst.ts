import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'

// Zod schema for Radarr instance configuration
const RadarrInstanceSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  baseUrl: z.string().url({ message: 'Invalid base URL' }),
  apiKey: z.string().min(1, { message: 'API Key is required' }),
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
        response: {
          200: z.array(RadarrInstanceSchema.extend({ id: z.number() })),
        },
        tags: ['Radarr Configuration'],
      },
    },
    async () => {
      const instances = await fastify.radarrManager.getAllInstances()
      // Ensure defaults are provided for all instances
      return instances.map((instance) => ({
        ...instance,
        searchOnAdd: instance.searchOnAdd ?? true,
        minimumAvailability: instance.minimumAvailability ?? 'released',
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
        body: RadarrInstanceSchema,
        response: {
          201: z.object({ id: z.number().int().positive() }),
        },
        tags: ['Radarr Configuration'],
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
        params: z.object({ id: z.coerce.number() }),
        body: RadarrInstanceSchema.partial(),
        tags: ['Radarr Configuration'],
      },
    },
    async (request, reply) => {
      const { id } = request.params
      const updates = request.body
      await fastify.radarrManager.updateInstance(id, updates)
      reply.status(204)
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
        tags: ['Radarr Configuration'],
      },
    },
    async (request, reply) => {
      const { id } = request.params
      await fastify.radarrManager.removeInstance(id)
      reply.status(204)
    },
  )
}

export default plugin
