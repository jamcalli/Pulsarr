import fp from 'fastify-plugin'
import apiReference from '@scalar/fastify-api-reference'
import fastifySwagger from '@fastify/swagger'
import {
  serializerCompiler,
  validatorCompiler,
  jsonSchemaTransform,
} from 'fastify-type-provider-zod'
import type { FastifyInstance } from 'fastify'

const createOpenapiConfig = (fastify: FastifyInstance) => {

  const urlObject = new URL(fastify.config.baseUrl)
  
  fastify.log.info(`Configuring Swagger with base URL: ${fastify.config.baseUrl}`)
  
  return {
    openapi: {
      info: {
        title: 'Pulsarr API',
        description: 'API documentation for Pulsarr - a Plex watchlist integration for Sonarr and Radarr',
        version: 'V1',
      },
      servers: [

        {
          url: fastify.config.baseUrl,
          description: 'Primary Server',
        },
        {
          url: `${urlObject.protocol}//${urlObject.hostname}:${fastify.config.port}`,
          description: 'Direct Server Access (with port)',
        }
      ],
      tags: [
        {
          name: 'Plex',
          description: 'Plex related endpoints',
        },
        {
          name: 'Sonarr',
          description: 'Sonarr related endpoints',
        },
        {
          name: 'Radarr',
          description: 'Radarr related endpoints',
        },
        {
          name: 'Config',
          description: 'Configuration endpoints',
        },
        {
          name: 'Authentication',
          description: 'Authentication endpoints',
        },
        {
          name: 'Users',
          description: 'User management endpoints',
        }
      ],
    },
    hideUntagged: true,
    exposeRoute: true,
    transform: jsonSchemaTransform,
  }
}

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