import { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { selfWatchlisTokenRoute } from './self-watchlist-token';
import { othersWatchlistTokenRoute } from './others-watchlist-token';
import { pingRoute } from './ping';

const plexPlugin: FastifyPluginAsyncTypebox = async (fastify) => {
  await fastify.register(selfWatchlisTokenRoute);
  await fastify.register(othersWatchlistTokenRoute);
  await fastify.register(pingRoute);
};

export default plexPlugin;