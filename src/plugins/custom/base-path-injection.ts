import { normalizeBasePath } from '@utils/url.js'
import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'

/**
 * Injects runtime base path into HTML responses for SPA.
 * Rewrites asset paths to include basePath for reverse proxy compatibility.
 */
async function basePathInjection(fastify: FastifyInstance) {
  fastify.addHook('onSend', async (_request, reply, payload) => {
    // Only modify HTML responses for the SPA
    const contentType = reply.getHeader('content-type')
    if (
      typeof contentType === 'string' &&
      contentType.includes('text/html') &&
      typeof payload === 'string'
    ) {
      // Get normalized base path from config
      const normalizedBasePath = normalizeBasePath(fastify.config.basePath)

      // Inject base path and asset helper as inline script before any other scripts
      const injectedScript = `<script>
        window.__BASE_PATH__ = ${JSON.stringify(normalizedBasePath)};
        window.__assetBase = function(filename) {
          return window.__BASE_PATH__ === '/' ? '/' + filename : window.__BASE_PATH__ + '/' + filename;
        };
      </script>`
      let modifiedPayload = payload.replace('<head>', `<head>${injectedScript}`)

      // Rewrite asset paths in HTML to include basePath for reverse proxy compatibility
      if (normalizedBasePath !== '/') {
        modifiedPayload = modifiedPayload.replace(
          /src="\/assets\//g,
          `src="${normalizedBasePath}/assets/`,
        )
        modifiedPayload = modifiedPayload.replace(
          /href="\/assets\//g,
          `href="${normalizedBasePath}/assets/`,
        )
        modifiedPayload = modifiedPayload.replace(
          /href="\/favicon\./g,
          `href="${normalizedBasePath}/favicon.`,
        )
      }

      return modifiedPayload
    }
    return payload
  })
}

export default fp(basePathInjection, {
  name: 'base-path-injection',
  dependencies: ['config'],
})
