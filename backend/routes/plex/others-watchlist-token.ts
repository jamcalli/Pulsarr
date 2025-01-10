import { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { getOthersWatchlist, processWatchlistItems } from '../../utils/plex';
import { getConfig } from '../../utils/config-manager';
import { Type } from '@sinclair/typebox';

const othersWatchlistSchema = {
  response: {
    200: Type.Union([
      Type.Array(Type.Object({
        user: Type.Object({
          id: Type.String(),
          username: Type.String()
        }),
        watchlist: Type.Array(Type.Object({
          title: Type.String(),
          key: Type.String(),
          type: Type.String(),
          guids: Type.Array(Type.String()),
          genres: Type.Array(Type.String())
        }))
      })),
      Type.Object({
        error: Type.String()
      })
    ])
  }
};

export const othersWatchlistTokenRoute: FastifyPluginAsyncTypebox = async (fastify) => {
  fastify.get('/others-watchlist-token', {
    schema: othersWatchlistSchema
  }, async (request, reply) => {
    const config = getConfig(fastify.log);
    if (!config.plexTokens || config.plexTokens.length === 0) {
      reply.code(500).send({ error: 'No Plex token configured' });
      return;
    }
    try {
      const userWatchlistMap = await getOthersWatchlist(config, fastify.log);
      if (userWatchlistMap.size === 0) {
        reply.code(500).send({ error: 'Unable to fetch others\' watchlist items' });
      } else {
        const userDetailedWatchlistMap = await processWatchlistItems(config, fastify.log, userWatchlistMap);
        const response = Array.from(userDetailedWatchlistMap.entries()).map(([user, watchlist]) => ({
          user,
          watchlist: Array.from(watchlist)
        }));
        reply.send(response);
      }
    } catch (err) {
      fastify.log.error(err);
      reply.code(500).send({ error: 'Unable to fetch others\' watchlist items' });
    }
  });
};