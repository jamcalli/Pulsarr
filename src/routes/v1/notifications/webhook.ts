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

interface MediaNotification {
  type: 'movie' | 'show'
  title: string
  username: string
  posterUrl?: string
}

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
        const mediaInfo =
          body.instanceName === 'Radarr'
            ? {
                type: 'movie' as const,
                guid: `tmdb:${body.movie.tmdbId}`,
                title: body.movie.title,
              }
            : {
                type: 'show' as const,
                guid: `tvdb:${body.series.tvdbId}`,
                title: body.series.title,
              }

        fastify.log.info({ mediaInfo }, 'Processing media webhook')

        const watchlistItems = await fastify.db.getWatchlistItemsByGuid(
          mediaInfo.guid,
        )

        for (const item of watchlistItems) {
          const user = await fastify.db.getUser(item.user_id)
          if (!user) continue

          const shouldNotify = await fastify.db.shouldSendNotification(item)
          if (shouldNotify) {
            if (user.notify_discord && user.discord_id) {
              const notification: MediaNotification = {
                type: mediaInfo.type,
                title: mediaInfo.title,
                username: user.name,
                posterUrl: item.thumb || undefined,
              }
              await fastify.discord.sendDirectMessage(
                user.discord_id,
                notification,
              )
            }
            if (user.notify_email) {
              // TODO: Implement email notification service
            }
          }
        }
        return { success: true }
      } catch (error) {
        fastify.log.error({ error }, 'Error processing webhook')
        throw reply.internalServerError('Error processing webhook')
      }
    },
  )
}

export default plugin
