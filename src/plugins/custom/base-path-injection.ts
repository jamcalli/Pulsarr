import { normalizeBasePath } from '@utils/url.js'
import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'

/**
 * Escapes characters that are unsafe in inline script contexts.
 * JSON.stringify handles quotes but not HTML/script-breaking characters.
 */
function escapeForScriptTag(str: string): string {
  return str
    .replace(/</g, '\\u003C')
    .replace(/>/g, '\\u003E')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
}

/**
 * Injects runtime base path into HTML responses for SPA.
 * Rewrites asset paths to include basePath for reverse proxy compatibility.
 */
async function basePathInjection(fastify: FastifyInstance) {
  fastify.addHook('onSend', async (_request, reply, payload) => {
    const contentType = reply.getHeader('content-type')

    // Only modify HTML responses for the SPA
    if (
      typeof contentType === 'string' &&
      contentType.includes('text/html') &&
      typeof payload === 'string'
    ) {
      // Get normalized base path from config
      const normalizedBasePath = normalizeBasePath(fastify.config.basePath)

      // Inject base path and asset helper for runtime URL resolution
      const safeBasePath = escapeForScriptTag(
        JSON.stringify(normalizedBasePath),
      )
      const safeAssetBase = escapeForScriptTag(
        JSON.stringify(normalizedBasePath === '/' ? '' : normalizedBasePath),
      )
      const injectedScript = `<script>window.__BASE_PATH__ = ${safeBasePath};window.__assetBase = function(f) { return ${safeAssetBase} + '/' + f; };</script>`
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
