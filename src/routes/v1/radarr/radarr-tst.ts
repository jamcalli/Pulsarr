import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'

// Zod schema for Radarr instance configuration
const RadarrInstanceSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  baseUrl: z.string().url({ message: 'Invalid base URL' }),
  apiKey: z.string().min(1, { message: 'API Key is required' }),
  qualityProfile: z.string().nullish(),
  rootFolder: z.string().nullish(),
  bypassIgnored: z.boolean().optional().default(false),
  tags: z.array(z.string()).optional().default([]),
  isDefault: z.boolean().optional().default(false),
  syncedInstances: z.array(z.number()).optional(),
})

// Zod schema for Genre Route with name field
const GenreRouteSchema = z.object({
  radarrInstanceId: z.number().min(1, 'Radarr Instance ID is required'),
  name: z.string().min(1, 'Name is required'),
  genre: z.string().min(1, 'Genre is required'),
  rootFolder: z.string().min(1, 'Root folder is required'),
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
      return await fastify.radarrManager.getAllInstances()
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

  // Genre Routes
  fastify.get<{
    Reply: Array<z.infer<typeof GenreRouteSchema> & { id: number }>
  }>(
    '/genre-routes',
    {
      schema: {
        response: {
          200: z.array(GenreRouteSchema.extend({ id: z.number() })),
        },
        tags: ['Radarr Configuration'],
      },
    },
    async () => {
      return await fastify.db.getRadarrGenreRoutes()
    },
  )

  fastify.post<{
    Body: z.infer<typeof GenreRouteSchema>
    Reply: z.infer<typeof GenreRouteSchema> & { id: number }
  }>(
    '/genre-routes',
    {
      schema: {
        body: GenreRouteSchema,
        response: {
          201: GenreRouteSchema.extend({ id: z.number() }),
        },
        tags: ['Radarr Configuration'],
      },
    },
    async (request, reply) => {
      const routeData = request.body
      const createdRoute = await fastify.radarrManager.addGenreRoute(routeData)
      reply.status(201)
      return createdRoute
    },
  )

  fastify.put<{
    Params: { id: number }
    Body: Partial<z.infer<typeof GenreRouteSchema>>
  }>(
    '/genre-routes/:id',
    {
      schema: {
        params: z.object({ id: z.coerce.number() }),
        body: GenreRouteSchema.partial(),
        tags: ['Radarr Configuration'],
      },
    },
    async (request, reply) => {
      const { id } = request.params
      const updates = request.body
      await fastify.radarrManager.updateGenreRoute(id, updates)
      reply.status(204)
    },
  )

  fastify.delete<{
    Params: { id: number }
  }>(
    '/genre-routes/:id',
    {
      schema: {
        params: z.object({ id: z.coerce.number() }),
        tags: ['Radarr Configuration'],
      },
    },
    async (request, reply) => {
      const { id } = request.params
      await fastify.radarrManager.removeGenreRoute(id)
      reply.status(204)
    },
  )
}

export default plugin