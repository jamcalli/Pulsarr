import { isTrustedRequestOrigin } from '@utils/request-origin.js'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import fp from 'fastify-plugin'

declare module 'fastify' {
  interface FastifyInstance {
    /** Auth strategy that rejects state-changing browser requests from origins other than this server or allowedOrigins. */
    checkRequestOrigin: (request: FastifyRequest) => Promise<void>
  }
}

async function requestOrigin(fastify: FastifyInstance) {
  fastify.decorate('checkRequestOrigin', async (request: FastifyRequest) => {
    const secFetchSite = request.headers['sec-fetch-site']
    const trusted = isTrustedRequestOrigin(
      {
        method: request.method,
        host: request.host,
        origin: request.headers.origin,
        secFetchSite: Array.isArray(secFetchSite)
          ? secFetchSite[0]
          : secFetchSite,
        hasApiKey: Boolean(request.headers['x-api-key']),
      },
      fastify.config.allowedOrigins,
    )
    if (!trusted) {
      throw fastify.httpErrors.forbidden('Cross-origin request not allowed')
    }
  })
}

export default fp(requestOrigin, {
  name: 'request-origin',
  dependencies: ['config'],
})
