import Fastify from 'fastify';
import AutoLoad from '@fastify/autoload';
import { getDbInstance } from '@db/db';
import { getOpenapiConfig } from '@shared/config/openapi-config';
import { getConfig } from '@shared/config/config-manager';
import cors from '@fastify/cors';
import { serializerCompiler, validatorCompiler, jsonSchemaTransform } from 'fastify-type-provider-zod';
import { gracefulShutdown } from '@shared/utils/app-specific';
import { fastifySwagger } from '@fastify/swagger';
import FastifyFormBody from '@fastify/formbody'

export function build() {
  
  const server = Fastify({
    logger: {
      transport: {
        target: '@fastify/one-line-logger'
      }
    }
  });

  server.register(FastifyFormBody)

  gracefulShutdown(server);

  server.setValidatorCompiler(validatorCompiler);
  server.setSerializerCompiler(serializerCompiler);

  const db = getDbInstance(server.log);
  server.decorate('db', db);

  const config = getConfig(server.log);
  const openapiConfig = {
    ...getOpenapiConfig(config.port),
    transform: jsonSchemaTransform
  };

  server.register(cors, {
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
  });

  server.register(fastifySwagger, openapiConfig);

  server.register(require('@scalar/fastify-api-reference'), {
    routePrefix: '/documentation',
  });

  server.register(AutoLoad, {
    dir: `${__dirname}/routes`,
  });

  return server;
}