import path from 'node:path'
import fastifyAutoload from '@fastify/autoload'
import { FastifyInstance, FastifyPluginOptions } from 'fastify'
import cors from '@fastify/cors'
import FastifyFormBody from '@fastify/formbody'
import { fastifySwagger } from '@fastify/swagger'
import apiReference from '@scalar/fastify-api-reference'
import {
  serializerCompiler,
  validatorCompiler,
  jsonSchemaTransform,
} from 'fastify-type-provider-zod'
import { getDbInstance } from '@db/db.js'
import { getOpenapiConfig } from '@shared/config/openapi-config.js'
import { getConfig } from '@shared/config/config-manager.js'

export const options = {
  ajv: {
    customOptions: {
      coerceTypes: 'array',
      removeAdditional: 'all'
    }
  }
}

export default async function serviceApp(
  fastify: FastifyInstance,
  opts: FastifyPluginOptions
) {
  // Basic setup
  fastify.register(FastifyFormBody)
  fastify.setValidatorCompiler(validatorCompiler)
  fastify.setSerializerCompiler(serializerCompiler)

  // Database setup
  const db = getDbInstance(fastify.log)
  fastify.decorate('db', db)

  // Configuration
  const config = getConfig(fastify.log)
  const openapiConfig = {
    ...getOpenapiConfig(config.port),
    transform: jsonSchemaTransform,
  }

  // CORS
  fastify.register(cors, {
    methods: ['GET', 'POST', 'PUT', 'DELETE']
  })

  // Documentation
  fastify.register(fastifySwagger, openapiConfig)
  fastify.register(apiReference, {
    routePrefix: '/documentation'
  })

  // Load external plugins
  //await fastify.register(fastifyAutoload, {
  //  dir: path.join(import.meta.dirname, 'plugins/external'),
  //  options: { ...opts }
  //})

  // Load custom plugins
  //fastify.register(fastifyAutoload, {
  //  dir: path.join(import.meta.dirname, 'plugins/custom'),
  //  options: { ...opts }
  //})

  // Load routes
  fastify.register(fastifyAutoload, {
    dir: path.join(import.meta.dirname, 'routes'),
    autoHooks: true,
    cascadeHooks: true,
    options: { ...opts }
  })

  // Error handler
  fastify.setErrorHandler((err, request, reply) => {
    fastify.log.error(
      {
        err,
        request: {
          method: request.method,
          url: request.url,
          query: request.query,
          params: request.params
        }
      },
      'Unhandled error occurred'
    )
    reply.code(err.statusCode ?? 500)
    let message = 'Internal Server Error'
    if (err.statusCode && err.statusCode < 500) {
      message = err.message
    }
    return { message }
  })

  /* 404 handler with rate limiting
  fastify.setNotFoundHandler(
    {
      preHandler: fastify.rateLimit({
        max: 3,
        timeWindow: 500
      })
    },
    (request, reply) => {
      request.log.warn(
        {
          request: {
            method: request.method,
            url: request.url,
            query: request.query,
            params: request.params
          }
        },
        'Resource not found'
      )
      reply.code(404)
      return { message: 'Not Found' }
    }
  )
    */
}