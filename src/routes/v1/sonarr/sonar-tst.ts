import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'

// Zod schema for Sonarr instance configuration
const SonarrInstanceSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  baseUrl: z.string().url('Invalid base URL'),
  apiKey: z.string().min(1, 'API Key is required'),
  qualityProfile: z.string().optional(),
  rootFolder: z.string().optional(),
  bypassIgnored: z.boolean().optional().default(false),
  seasonMonitoring: z.string().optional().default('all'),
  tags: z.array(z.string()).optional().default([]),
  isDefault: z.boolean().optional().default(false),
})

// Zod schema for Genre Route
const GenreRouteSchema = z.object({
  sonarrInstanceId: z.number().min(1, 'Sonarr Instance ID is required'),
  genre: z.string().min(1, 'Genre is required'),
  rootFolder: z.string().min(1, 'Root folder is required'),
})

const plugin: FastifyPluginAsync = async (fastify) => {
  // Get all Sonarr instances
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
      return await fastify.db.getAllSonarrInstances()
    },
  )

  // Create a new Sonarr instance
  fastify.post<{
    Body: z.infer<typeof SonarrInstanceSchema>
    Reply: { id: number }
  }>(
    '/instances',
    {
      schema: {
        body: SonarrInstanceSchema,
        response: {
          201: z.object({ id: z.number() }),
        },
        tags: ['Sonarr Configuration'],
      },
    },
    async (request, reply) => {
      const instanceData = request.body
      const id = await fastify.db.createSonarrInstance(instanceData)
      reply.status(201)
      return { id }
    },
  )

  // Get genre routes
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

  // Create a genre route
  fastify.post<{
    Body: z.infer<typeof GenreRouteSchema>
    Reply: { id: number }
  }>(
    '/genre-routes',
    {
      schema: {
        body: GenreRouteSchema,
        response: {
          201: z.object({ id: z.number() }),
        },
        tags: ['Sonarr Configuration'],
      },
    },
    async (request, reply) => {
      const routeData = request.body
      const id = await fastify.db.createSonarrGenreRoute(routeData)
      reply.status(201)
      return { id }
    },
  )

  // Update a genre route
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
      await fastify.db.updateSonarrGenreRoute(id, updates)
      reply.status(204)
    },
  )

  // Delete a genre route
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
      await fastify.db.deleteSonarrGenreRoute(id)
      reply.status(204)
    },
  )
}

export default plugin
