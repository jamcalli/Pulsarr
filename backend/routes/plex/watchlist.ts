import { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { getSelfWatchlist } from '../../utils/plex';
import { schemas } from './schema';
import { getConfig } from '../../utils/config-manager';

export const watchlistRoute: FastifyPluginAsyncTypebox = async (fastify) => {
  fastify.get('/watchlist', {
    schema: schemas.watchlist
  }, async (request, reply) => {
    const config = getConfig(fastify.log);
    if (!config.plexTokens || config.plexTokens.length === 0) {
      reply.code(500).send({ error: 'No Plex token configured' });
      return;
    }
    try {
      const items = await getSelfWatchlist(config, fastify.log, request.query.start);
      if (items.size === 0) {
        reply.code(500).send({ error: 'Unable to fetch watchlist items' });
      } else {
        reply.send(Array.from(items));
      }
    } catch (err) {
      fastify.log.error(err);
      reply.code(500).send({ error: 'Unable to fetch watchlist items' });
    }
  });
};