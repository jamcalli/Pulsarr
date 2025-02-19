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
  const isLocal = urlObject.hostname === 'localhost' || urlObject.hostname === '127.0.0.1'
  
  // Always include the port - this is the actual API endpoint
  const baseUrl = `${urlObject.protocol}//${urlObject.hostname}:${fastify.config.port}`

  return {
    openapi: {
      info: {
        title: 'Test swagger',
        description: 'testing the fastify swagger api',
        version: 'V1',
      },
      servers: [
        {
          url: baseUrl,
          description: isLocal ? 'Development Server' : 'Production Server',
        },
        ...(isLocal
          ? [
              {
                url: baseUrl.replace('localhost', '127.0.0.1'),
                description: 'Development Server (IP)',
              },
            ]
          : []),
      ],
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
