import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { PlexWatchlistService } from '@plex/services/plex-watchlist-service';
import { pingSchema } from '@schemas/plex/ping.schema';

export const pingRoute: FastifyPluginAsyncZod = async function(fastify, _opts) {
  const plexService = new PlexWatchlistService(fastify.log);

  fastify.route({
    method: 'GET',
    url: '/ping',
    schema: pingSchema,
    handler: async (_request, reply) => {
      try {
        const success = await plexService.pingPlex();
        reply.send({ success });
      } catch (err) {
        fastify.log.error(err);
        reply.code(500).send({ success: false });
      }
    }
  });
};