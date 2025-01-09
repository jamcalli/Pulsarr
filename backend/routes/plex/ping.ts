import { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { pingPlex } from '../../utils/plex';
import { schemas } from './schema';
import { getConfig } from '../../utils/config-manager';

export const pingRoute: FastifyPluginAsyncTypebox = async (fastify) => {
  fastify.post('/ping', {
    schema: schemas.ping
  }, async () => {
    const config = getConfig(fastify.log);
    const tokens: string[] = config.plexTokens || [];
    await Promise.all(tokens.map(token => pingPlex(token, fastify.log)));
    return { success: true };
  });
};