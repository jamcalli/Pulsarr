import { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox'
import { watchlistRoute } from './watchlist'
import { othersWatchlistRoute } from './others-watchlist'
import { pingRoute } from './ping'

const plexPlugin: FastifyPluginAsyncTypebox = async (fastify) => {
  await fastify.register(watchlistRoute)
  await fastify.register(othersWatchlistRoute)
  await fastify.register(pingRoute)
}

export default plexPlugin