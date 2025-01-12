import { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { getSelfWatchlist } from '../../utils/plex';
import { getConfig } from '../../utils/config-manager';
import { Type } from '@sinclair/typebox';

const watchlistSchema = {
  response: {
    200: Type.Union([
      Type.Object({
        total: Type.Number(),
        items: Type.Array(Type.Object({
          title: Type.String(),
          key: Type.String(),
          type: Type.String(),
          guids: Type.Array(Type.String()),
          genres: Type.Array(Type.String())
        }))
      }),
      Type.Object({
        error: Type.String()
      })
    ])
  }
};

export const selfWatchlisTokenRoute: FastifyPluginAsyncTypebox = async (fastify) => {
  fastify.get('/self-watchlist-token', {
    schema: watchlistSchema
  }, async (request, reply) => {
    const config = getConfig(fastify.log);
    if (!config.plexTokens || config.plexTokens.length === 0) {
      reply.code(500).send({ error: 'No Plex token configured' });
      return;
    }
    try {
      const items = await getSelfWatchlist(config, fastify.log);
      if (items.size === 0) {
        reply.code(500).send({ error: 'Unable to fetch watchlist items' });
      } else {
        const response = {
          total: items.size,
          items: Array.from(items).map(item => ({
            title: item.title,
            key: item.key,
            type: item.type,
            guids: item.guids ?? [],
            genres: item.genres ?? []
          }))
        };
        reply.send(response);
      }
    } catch (err) {
      fastify.log.error(err);
      reply.code(500).send({ error: 'Unable to fetch watchlist items' });
    }
  });
};