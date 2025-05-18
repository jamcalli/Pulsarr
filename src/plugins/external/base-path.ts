import fp from 'fastify-plugin'
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'

/**
 * Base path plugin for fastify
 * This plugin adds support for running the application under a base path like /pulsarr
 * It handles:
 * - URL rewriting for incoming requests (handled by reverse proxy)
 * - Location header rewriting for redirects
 */
export default fp(
  async (fastify: FastifyInstance) => {
    const basePath = fastify.config.basePath?.replace(/\/$/, '') || ''

    // If no base path is configured, skip all processing
    if (!basePath) {
      return
    }

    fastify.log.info(`Base path configured: ${basePath}`)

    // Hook to rewrite Location headers in redirects
    fastify.addHook(
      'onSend',
      async (
        request: FastifyRequest,
        reply: FastifyReply,
        payload: unknown,
      ) => {
        // Only process redirect responses
        if (reply.statusCode >= 300 && reply.statusCode < 400) {
          const location = reply.getHeader('location')

          if (
            location &&
            typeof location === 'string' &&
            location.startsWith('/')
          ) {
            // Don't add base path to absolute URLs
            if (
              !location.startsWith('http://') &&
              !location.startsWith('https://')
            ) {
              const newLocation = basePath + location
              reply.header('location', newLocation)
              fastify.log.debug(
                `Rewriting redirect from ${location} to ${newLocation}`,
              )
            }
          }
        }

        return payload
      },
    )

    // Decorate fastify instance with basePath
    fastify.decorate('basePath', basePath)
  },
  {
    name: 'base-path',
    dependencies: ['config'],
  },
)

declare module 'fastify' {
  interface FastifyInstance {
    basePath: string
  }
}
