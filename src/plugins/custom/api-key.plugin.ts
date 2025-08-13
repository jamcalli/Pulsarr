import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify'
import fp from 'fastify-plugin'
import auth from '@fastify/auth'
import { ApiKeyService } from '@services/api-key.service.js'

/**
 * Plugin to register the API key service and authentication strategy
 */
const apiKeyPlugin: FastifyPluginAsync = async (fastify, _opts) => {
  // Register the auth plugin
  await fastify.register(auth)

  // Create the API key service
  const apiKeyService = new ApiKeyService(fastify)

  // Initialize the service (loads keys into cache)
  await apiKeyService.initialize()

  // Decorate fastify with the service
  fastify.decorate('apiKeys', apiKeyService)

  // Register API key verification strategy
  fastify.decorate(
    'verifyApiKey',
    async (
      request: FastifyRequest,
      _reply: FastifyReply,
      done: (error?: Error) => void,
    ) => {
      const apiKey = request.headers['x-api-key'] as string

      if (!apiKey) {
        const error = new Error('Missing API key') as Error & {
          statusCode?: number
        }
        error.statusCode = 401
        return done(error)
      }

      const isValid = await apiKeyService.validateApiKey(apiKey)

      if (!isValid) {
        fastify.log.warn(
          { ip: request.ip, url: request.url },
          'Invalid API key authentication attempt',
        )
        const error = new Error('Invalid API key') as Error & {
          statusCode?: number
        }
        error.statusCode = 401
        return done(error)
      }

      done()
    },
  )
}

export default fp(apiKeyPlugin, {
  name: 'api-key',
  dependencies: ['database'],
})

// Add type definitions
declare module 'fastify' {
  interface FastifyInstance {
    apiKeys: ApiKeyService
    verifyApiKey: (
      request: FastifyRequest,
      reply: FastifyReply,
      done: (error?: Error) => void,
    ) => void
  }
}
