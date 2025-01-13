import { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { Type } from '@sinclair/typebox';
import { PlexWatchlistService } from '@plex/services/plex-watchlist-service';

const othersWatchlistSchema = {
  response: {
    200: Type.Union([
      Type.Object({
        total: Type.Number(),
        users: Type.Array(Type.Object({
          user: Type.Object({
            watchlistId: Type.String(),
            username: Type.String()
          }),
          watchlist: Type.Array(Type.Object({
            title: Type.String(),
            plexKey: Type.String(),
            type: Type.String(),
            guids: Type.Array(Type.String()),
            genres: Type.Array(Type.String())
          }))
        }))
      }),
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
    try {
      const plexService = new PlexWatchlistService(fastify.log);
      const response = await plexService.getOthersWatchlists();
      reply.send(response);
    } catch (err) {
      fastify.log.error(err);
      reply.code(500).send({ error: 'Unable to fetch others\' watchlist items' });
    }
  });
};