import auth from '@fastify/auth'
import { ApiKeyService } from '@services/api-key.service.js'
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify'
import fp from 'fastify-plugin'

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

      // Get full user data from cache and populate session
      const user = apiKeyService.getUserForKey(apiKey)
      if (user) {
        request.session.user = user
        fastify.log.debug(
          { userId: user.id, username: user.username, ip: request.ip },
          'API key authentication successful - user session populated',
        )
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
