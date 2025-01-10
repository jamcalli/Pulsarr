import { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { selfWatchlisTokenRoute } from './self-watchlist-token';
import { othersWatchlistTokenRoute } from './others-watchlist-token';
import { pingRoute } from './ping';
import { generateRssFeedsRoute } from './generate-rss-feeds';

const plexPlugin: FastifyPluginAsyncTypebox = async (fastify) => {
  await fastify.register(selfWatchlisTokenRoute);
  await fastify.register(othersWatchlistTokenRoute);
  await fastify.register(pingRoute);
  await fastify.register(generateRssFeedsRoute);
};

export default plexPlugin;