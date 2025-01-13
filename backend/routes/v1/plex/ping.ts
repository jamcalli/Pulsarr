import { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { Type } from '@sinclair/typebox';
import { PlexWatchlistService } from '@plex/services/plex-watchlist-service';

const pingSchema = {
  response: {
    200: Type.Object({
      success: Type.Boolean()
    })
  }
};

export const pingRoute: FastifyPluginAsyncTypebox = async (fastify) => {
  const plexService = new PlexWatchlistService(fastify.log);

  fastify.get('/ping', {
    schema: pingSchema
  }, async (_request, reply) => {
    try {
      const success = await plexService.pingPlex();
      reply.send({ success });
    } catch (err) {
      fastify.log.error(err);
      reply.code(500).send({ success: false });
    }
  });
};