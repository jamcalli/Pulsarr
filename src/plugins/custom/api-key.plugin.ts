import type { FastifyPluginAsync } from 'fastify'
import fp from 'fastify-plugin'
import bearerAuthPlugin from '@fastify/bearer-auth'
import { ApiKeyService } from '@services/api-key.service.js'

/**
 * Plugin to register the API key service and bearer auth
 */
const apiKeyPlugin: FastifyPluginAsync = async (fastify, opts) => {
  // Create the API key service
  const apiKeyService = new ApiKeyService(fastify)

  // Initialize the service (loads keys into cache)
  await apiKeyService.initialize()

  // Decorate fastify with the service
  fastify.decorate('apiKeys', apiKeyService)

  // Register bearer auth plugin with dynamic validation
  await fastify.register(bearerAuthPlugin, {
    keys: new Set<string>(), // Required by type but not used since we have custom auth
    addHook: false,
    auth: async (key, req) => {
      const isValid = await apiKeyService.validateApiKey(key)
      if (!isValid) {
        fastify.log.warn(
          { ip: req.ip, url: req.url },
          'Invalid API key authentication attempt',
        )
      }
      return isValid
    },
    errorResponse: (err) => {
      return { error: 'Invalid API key' }
    },
  })
}

export default fp(apiKeyPlugin, {
  name: 'api-key',
  dependencies: ['database'],
})

// Add type definitions
declare module 'fastify' {
  interface FastifyInstance {
    apiKeys: ApiKeyService
  }
}
