import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { PlexWatchlistService } from '@plex/services/plex-watchlist-service';
import { othersWatchlistSchema } from '@schemas/plex/others-watchlist-token.schema';

export const othersWatchlistTokenRoute: FastifyPluginAsyncZod = async function(fastify, _opts) {
  fastify.route({
    method: 'GET',
    url: '/others-watchlist-token',
    schema: othersWatchlistSchema,
    handler: async (_request, reply) => {
      try {
        const plexService = new PlexWatchlistService(fastify.log);
        const response = await plexService.getOthersWatchlists();
        reply.send(response);
      } catch (err) {
        fastify.log.error(err);
        reply.code(500).send({ error: 'Unable to fetch others\' watchlist items' });
      }
    }
  });
};