import { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { getPlexWatchlistUrls } from '../../utils/plex';
import { getConfig } from '../../utils/config-manager';
import { Type } from '@sinclair/typebox';

const plexWatchlistSchema = {
  response: {
    200: Type.Union([
      Type.Object({
        self: Type.String(),
        friends: Type.String()
      }),
      Type.Object({
        error: Type.String()
      })
    ])
  }
};

export const generateRssFeedsRoute: FastifyPluginAsyncTypebox = async (fastify) => {
  fastify.post('/generate-rss-feeds', {
    schema: plexWatchlistSchema
  }, async (request, reply) => {
    const config = getConfig(fastify.log);
    if (!config.plexTokens || config.plexTokens.length === 0) {
      reply.code(500).send({ error: 'No Plex token configured' });
      return;
    }
    try {
      const tokens: Set<string> = new Set(config.plexTokens);
      const watchlistUrls = await getPlexWatchlistUrls(tokens, config.skipFriendSync || false, fastify.log);
      if (watchlistUrls.size === 0) {
        reply.code(500).send({ error: 'Unable to fetch watchlist URLs' });
      } else {
        const response = {
          self: Array.from(watchlistUrls)[0] || '',
          friends: Array.from(watchlistUrls)[1] || ''
        };
        reply.send(response);
      }
    } catch (err) {
      fastify.log.error(err);
      reply.code(500).send({ error: 'Unable to fetch watchlist URLs' });
    }
  });
};