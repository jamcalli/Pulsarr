import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'

// Zod schema for Sonarr instance configuration
const SonarrInstanceSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  baseUrl: z.string().url({ message: 'Invalid base URL' }),
  apiKey: z.string().min(1, { message: 'API Key is required' }),
  qualityProfile: z.string().nullish(),
  rootFolder: z.string().nullish(),
  bypassIgnored: z.boolean().optional().default(false),
  seasonMonitoring: z.string().optional().default('all'),
  tags: z.array(z.string()).optional().default([]),
  isDefault: z.boolean().optional().default(false),
  syncedInstances: z.array(z.number()).optional(),
})

// Zod schema for Genre Route with name field
const GenreRouteSchema = z.object({
  sonarrInstanceId: z.number().min(1, 'Sonarr Instance ID is required'),
  name: z.string().min(1, 'Name is required'),
  genre: z.string().min(1, 'Genre is required'),
  rootFolder: z.string().min(1, 'Root folder is required'),
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
        tags: ['Sonarr Configuration'],
      },
    },
    async () => {
      return await fastify.db.getSonarrGenreRoutes()
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
        tags: ['Sonarr Configuration'],
      },
    },
    async (request, reply) => {
      const routeData = request.body
      const createdRoute = await fastify.sonarrManager.addGenreRoute(routeData)
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
        tags: ['Sonarr Configuration'],
      },
    },
    async (request, reply) => {
      const { id } = request.params
      const updates = request.body
      await fastify.sonarrManager.updateGenreRoute(id, updates)
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
        tags: ['Sonarr Configuration'],
      },
    },
    async (request, reply) => {
      const { id } = request.params
      await fastify.sonarrManager.removeGenreRoute(id)
      reply.status(204)
    },
  )
}

export default plugin