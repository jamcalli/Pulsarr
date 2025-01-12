import { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { pingPlex } from '@plex/utils/plex';
import { getConfig } from '@shared/config/config-manager';
import { Type } from '@sinclair/typebox';

const pingSchema = {
  response: {
    200: Type.Object({
      success: Type.Boolean()
    })
  }
};

export const pingRoute: FastifyPluginAsyncTypebox = async (fastify) => {
  fastify.post('/ping', {
    schema: pingSchema
  }, async () => {
    const config = getConfig(fastify.log);
    const tokens: string[] = config.plexTokens || [];
    await Promise.all(tokens.map(token => pingPlex(token, fastify.log)));
    return { success: true };
  });
};