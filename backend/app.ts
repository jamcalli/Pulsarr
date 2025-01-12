import Fastify from 'fastify';
import AutoLoad from '@fastify/autoload';
import Swagger from '@fastify/swagger';
import { getDbInstance } from './db/db';

export function build () {
  const server = Fastify({
    logger: {
      level: 'info',
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname'
        }
      }
    }
  });

  const db = getDbInstance(server.log);

  server.decorate('db', db);

  server.register(Swagger);
  server.register(require('@scalar/fastify-api-reference'), {
    routePrefix: '/documentation',
  })

  server.register(AutoLoad, {
    dir: `${__dirname}/routes`,
  });

  return server;
}