import Fastify from 'fastify';
import AutoLoad from '@fastify/autoload';
import Swagger from '@fastify/swagger';
import { getDbInstance } from '@db/db';
import { loggerConfig } from '@shared/logger/logger';

export function build() {
  const server = Fastify({
    logger: loggerConfig
  });

  const db = getDbInstance(server.log);
  server.decorate('db', db);

  server.register(Swagger);
  server.register(require('@scalar/fastify-api-reference'), {
    routePrefix: '/documentation',
  });

  server.register(AutoLoad, {
    dir: `${__dirname}/routes`,
  });

  return server;
}