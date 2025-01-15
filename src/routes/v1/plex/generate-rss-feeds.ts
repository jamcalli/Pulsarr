import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { getPlexWatchlistUrls } from '@plex/utils/plex';
import { getConfig } from '@shared/config/config-manager';
import { rssFeedsSchema } from '@schemas/plex/generate-rss-feeds.schema';

export const generateRssFeedsRoute: FastifyPluginAsyncZod = async function(fastify, _opts) {
  fastify.route({
    method: 'GET',
    url: '/generate-rss-feeds',
    schema: rssFeedsSchema,
    handler: async (_request, reply) => {
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
    }
  });
};