import { z } from 'zod'
import type { FastifyPluginAsync } from 'fastify'

// Schema definitions
const RadarrMovieSchema = z.object({
  id: z.number(),
  title: z.string(),
  imdbId: z.string().optional(),
  tmdbId: z.number(),
})

const SonarrSeriesSchema = z.object({
  id: z.number(),
  title: z.string(),
  tvdbId: z.number(),
  imdbId: z.string().optional(),
})

const WebhookPayloadSchema = z.discriminatedUnion('instanceName', [
  z.object({
    instanceName: z.literal('Radarr'),
    movie: RadarrMovieSchema,
  }),
  z.object({
    instanceName: z.literal('Sonarr'),
    series: SonarrSeriesSchema,
  }),
])

const plugin: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: z.infer<typeof WebhookPayloadSchema>
  }>(
    '/webhook',
    {
      schema: {
        body: WebhookPayloadSchema,
      },
    },
    async (request, reply) => {
      const { body } = request
      
      try {
        const mediaInfo = body.instanceName === 'Radarr' 
          ? {
              type: 'movie' as const,
              id: body.movie.id,
              imdbId: body.movie.imdbId,
              tmdbId: body.movie.tmdbId,
              title: body.movie.title,
            }
          : {
              type: 'show' as const,
              id: body.series.id,
              imdbId: body.series.imdbId,
              tvdbId: body.series.tvdbId,
              title: body.series.title,
            }

        // Hand off to appropriate service for processing
        fastify.log.info({ mediaInfo }, 'Processing media webhook')

        return { success: true }
      } catch (error) {
        fastify.log.error({ error }, 'Error processing webhook')
        throw reply.internalServerError('Error processing webhook')
      }
    },
  )
}

export default plugin