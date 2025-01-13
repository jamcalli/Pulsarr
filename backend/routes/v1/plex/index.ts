import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { selfWatchlistTokenRoute } from '@routes/v1/plex/self-watchlist-token';
import { othersWatchlistTokenRoute } from '@routes/v1/plex/others-watchlist-token';
import { pingRoute } from '@routes/v1/plex/ping';
import { generateRssFeedsRoute } from '@routes/v1/plex/generate-rss-feeds';

const plexPlugin: FastifyPluginAsyncZod = async (fastify) => {
  await fastify.register(selfWatchlistTokenRoute);
  await fastify.register(othersWatchlistTokenRoute);
  await fastify.register(pingRoute);
  await fastify.register(generateRssFeedsRoute);
};

export default plexPlugin;