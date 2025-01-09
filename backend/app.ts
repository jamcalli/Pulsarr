import Fastify from 'fastify';
import AutoLoad from '@fastify/autoload';
import Swagger from '@fastify/swagger';
import SwaggerUI from '@fastify/swagger-ui';

export function build () {
  const server = Fastify({
    logger: {
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

  server.register(Swagger);
  server.register(SwaggerUI);

  server.register(AutoLoad, {
    dir: `${__dirname}/routes`,
  });

  return server
}