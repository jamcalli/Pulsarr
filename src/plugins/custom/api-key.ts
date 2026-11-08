import auth from '@fastify/auth'
import { ApiKeyService } from '@services/api-key.service.js'
import type { FastifyPluginAsync, FastifyRequest } from 'fastify'
import fp from 'fastify-plugin'

const presentedApiKey = (request: FastifyRequest): string | undefined => {
  const rawApiKey = request.headers['x-api-key']
  const apiKey = Array.isArray(rawApiKey) ? rawApiKey[0] : rawApiKey
  return apiKey || undefined
}

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

  fastify.decorate('rejectInvalidApiKey', async (request: FastifyRequest) => {
    const apiKey = presentedApiKey(request)
    if (apiKey && !apiKeyService.verifyAndGetUser(apiKey)) {
      fastify.log.warn(
        { ip: request.ip, url: request.url },
        'Invalid API key authentication attempt',
      )
      throw fastify.httpErrors.unauthorized('Invalid API key')
    }
  })

  fastify.decorate('verifyApiKey', async (request: FastifyRequest) => {
    const apiKey = presentedApiKey(request)
    const user = apiKey ? apiKeyService.verifyAndGetUser(apiKey) : null
    if (!user) {
      throw fastify.httpErrors.unauthorized('Missing API key')
    }

    request.user = user
    fastify.log.debug(
      { userId: user.id, username: user.username, ip: request.ip },
      'API key authentication successful',
    )
  })
}

export default fp(apiKeyPlugin, {
  name: 'api-key',
  dependencies: ['database', 'session'],
})

declare module 'fastify' {
  interface FastifyInstance {
    apiKeys: ApiKeyService
    /** Auth strategy that fails only when an API key is presented and does not match. */
    rejectInvalidApiKey: (request: FastifyRequest) => Promise<void>
    verifyApiKey: (request: FastifyRequest) => Promise<void>
  }
}
