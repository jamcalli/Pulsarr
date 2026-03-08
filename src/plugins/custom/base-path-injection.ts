import { normalizeBasePath } from '@utils/url.js'
import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'

/**
 * Injects a <base> tag into HTML responses for SPA.
 * The <base> tag handles relative asset URL resolution natively (./assets/...),
 * and client JS reads it to derive the base path for API calls and routing.
 */
async function basePathInjection(fastify: FastifyInstance) {
  const normalizedBasePath = normalizeBasePath(fastify.config.basePath)
  const baseHref = normalizedBasePath === '/' ? '/' : `${normalizedBasePath}/`

  fastify.addHook('onSend', async (request, reply, payload) => {
    const contentType = reply.getHeader('content-type')

    if (
      typeof contentType === 'string' &&
      contentType.includes('text/html') &&
      typeof payload === 'string' &&
      payload.includes('<div id="app">') &&
      !request.url.includes('/api/docs')
    ) {
      return payload.replace('<head>', `<head><base href="${baseHref}">`)
    }
    return payload
  })
}

export default fp(basePathInjection, {
  name: 'base-path-injection',
  dependencies: ['config'],
})
