import { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { getOthersWatchlist } from '../../utils/plex';
import { schemas } from './schema';
import { getConfig } from '../../utils/config-manager';

export const othersWatchlistRoute: FastifyPluginAsyncTypebox = async (fastify) => {
  fastify.get('/others-watchlist', {
    schema: schemas.othersWatchlist
  }, async (request, reply) => {
    const config = getConfig(fastify.log);
    if (!config.plexTokens || config.plexTokens.length === 0) {
      reply.code(500).send({ error: 'No Plex token configured' });
      return;
    }
    try {
      const items = await getOthersWatchlist(config, fastify.log);
      if (items.size === 0) {
        reply.code(500).send({ error: 'Unable to fetch others\' watchlist items' });
      } else {
        reply.send(Array.from(items));
      }
    } catch (err) {
      fastify.log.error(err);
      reply.code(500).send({ error: 'Unable to fetch others\' watchlist items' });
    }
  });
};