import Fastify from 'fastify';
import AutoLoad from '@fastify/autoload';
import { getDbInstance } from '@db/db.js';
import { getOpenapiConfig } from '@shared/config/openapi-config.js';
import { getConfig } from '@shared/config/config-manager.js';
import cors from '@fastify/cors';
import { serializerCompiler, validatorCompiler, jsonSchemaTransform } from 'fastify-type-provider-zod';
import { gracefulShutdown } from '@shared/utils/app-specific.js';
import { fastifySwagger } from '@fastify/swagger';
import FastifyFormBody from '@fastify/formbody';
import { getDirname } from '@utils/paths.js';
import apiReference from '@scalar/fastify-api-reference';

export function build() {
  const server = Fastify({
    logger: {
      transport: {
        target: '@fastify/one-line-logger'
      }
    }
  });

  server.register(FastifyFormBody);

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

  server.register(apiReference, {
    routePrefix: '/documentation',
  });

  const currentDir = getDirname(import.meta.url);
  server.register(AutoLoad, {
    dir: `${currentDir}/routes`,
  });

  return server;
}