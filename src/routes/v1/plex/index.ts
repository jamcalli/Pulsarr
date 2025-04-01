import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { selfWatchlistTokenRoute } from '@routes/v1/plex/self-watchlist-token.js'
import { othersWatchlistTokenRoute } from '@routes/v1/plex/others-watchlist-token.js'
import { pingRoute } from '@routes/v1/plex/ping.js'
import { generateRssFeedsRoute } from '@routes/v1/plex/generate-rss-feeds.js'
import { rssWatchlistRoute } from '@routes/v1/plex/parse-rss.js'
import { getGenresRoute } from '@routes/v1/plex/get-genres.js'
import { configureNotificationsRoute } from '@routes/v1/plex/configure-notifications.js'
import { removeNotificationsRoute } from '@routes/v1/plex/remove-notifications.js'
import { getNotificationStatusRoute } from '@routes/v1/plex/get-notification-status.js'

const plexPlugin: FastifyPluginAsyncZod = async (fastify) => {
  await fastify.register(selfWatchlistTokenRoute)
  await fastify.register(othersWatchlistTokenRoute)
  await fastify.register(pingRoute)
  await fastify.register(generateRssFeedsRoute)
  await fastify.register(rssWatchlistRoute)
  await fastify.register(getGenresRoute)
  await fastify.register(configureNotificationsRoute)
  await fastify.register(removeNotificationsRoute)
  await fastify.register(getNotificationStatusRoute)
}

export default plexPlugin
