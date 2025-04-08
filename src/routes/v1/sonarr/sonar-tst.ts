import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'

// Zod schema for Sonarr instance configuration
const SonarrInstanceSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  baseUrl: z.string().url({ message: 'Invalid base URL' }),
  apiKey: z.string().min(1, { message: 'API Key is required' }),
  qualityProfile: z.union([z.string(), z.number()]).nullish(),
  rootFolder: z.string().nullish(),
  bypassIgnored: z.boolean().optional().default(false),
  seasonMonitoring: z.string().optional().default('all'),
  tags: z.array(z.string()).optional().default([]),
  isDefault: z.boolean().optional().default(false),
  syncedInstances: z.array(z.number()).optional(),
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
      return await fastify.sonarrManager.getAllInstances()
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
      },
    },
    async (request, reply) => {
      const { id } = request.params
      const updates = request.body

      await fastify.sonarrManager.updateInstance(id, updates)
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
        tags: ['Sonarr Configuration'],
      },
    },
    async (request, reply) => {
      const { id } = request.params
      await fastify.sonarrManager.removeInstance(id)
      reply.status(204)
    },
  )
}

export default plugin
