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
  const apiKeyService = new ApiKeyService(fastify.log, fastify)

  // Initialize the service (loads keys into cache)
  await apiKeyService.initialize()

  // Decorate fastify with the service
  fastify.decorate('apiKeys', apiKeyService)

  // Register API key verification strategy
  fastify.decorate(
    'verifyApiKey',
    (
      request: FastifyRequest,
      _reply: FastifyReply,
      done: (error?: Error) => void,
    ) => {
      const rawApiKey = request.headers['x-api-key']
      const apiKey = Array.isArray(rawApiKey) ? rawApiKey[0] : rawApiKey

      if (!apiKey) {
        const error = new Error('Missing API key') as Error & {
          statusCode?: number
        }
        error.statusCode = 401
        return done(error)
      }

      // Verify API key and get user data in single operation
      const user = apiKeyService.verifyAndGetUser(apiKey)

      if (!user) {
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

      // Defensive: ensure session plugin has initialized `request.session`
      if (!request.session) {
        fastify.log.error(
          { apiKey: `${apiKey.substring(0, 8)}...`, ip: request.ip },
          'Session plugin not initialized - cannot populate user session',
        )
        return done(new Error('Session not initialized'))
      }

      request.session.user = user
      fastify.log.debug(
        { userId: user.id, username: user.username, ip: request.ip },
        'API key authentication successful - user session populated',
      )

      done()
    },
  )
}

export default fp(apiKeyPlugin, {
  name: 'api-key',
  dependencies: ['database', 'session'],
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
