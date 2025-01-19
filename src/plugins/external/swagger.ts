import fp from 'fastify-plugin'
import apiReference from '@scalar/fastify-api-reference'
import fastifySwagger from '@fastify/swagger'
import {
  serializerCompiler,
  validatorCompiler,
  jsonSchemaTransform,
} from 'fastify-type-provider-zod'
import type { FastifyInstance } from 'fastify'

const createOpenapiConfig = (fastify: FastifyInstance) => ({
  openapi: {
    info: {
      title: 'Test swagger',
      description: 'testing the fastify swagger api',
      version: '0.1.0',
    },
    servers: [
      {
        url: `http://localhost:${fastify.config.port}`,
      },
    ],
    /*
    components: {
      securitySchemes: {
        apiKey: {
          type: 'apiKey',
          name: 'apiKey',
          in: 'header'
        }
      }
    },
    */
    tags: [
      {
        name: 'Plex',
        description: 'Plex related endpoints',
      },
    ],
  },
  hideUntagged: true,
  exposeRoute: true,
  transform: jsonSchemaTransform,
})

export default fp(
  async (fastify: FastifyInstance) => {
    // Set up Zod validators
    fastify.setValidatorCompiler(validatorCompiler)
    fastify.setSerializerCompiler(serializerCompiler)

    /**
     * Register Swagger with combined config
     * @see {@link https://github.com/fastify/fastify-swagger}
     */
    await fastify.register(fastifySwagger, createOpenapiConfig(fastify))

    /**
     * Register Swagger UI
     * @see {@link https://github.com/fastify/fastify-swagger-ui}
     */
    await fastify.register(apiReference, {
      routePrefix: '/api/docs',
    })
  },
  {
    dependencies: ['config'],
  },
)
