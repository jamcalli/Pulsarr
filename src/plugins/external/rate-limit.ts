import fastifyRateLimit from '@fastify/rate-limit'
import type { FastifyInstance, FastifyRequest } from 'fastify'

export const autoConfig = (fastify: FastifyInstance) => {
  return {
    max: fastify.config.rateLimitMax,
    timeWindow: '1 minute',
    allowList: (req: FastifyRequest) => {
      // Skip rate limiting for static assets (handles both root and prefixed paths)
      const url = req.url
      return (
        url.includes('/assets/') ||
        url.includes('/favicon') ||
        url.endsWith('.js') ||
        url.endsWith('.css') ||
        url.endsWith('.woff2') ||
        url.endsWith('.woff') ||
        url.endsWith('.svg') ||
        url.endsWith('.png') ||
        url.endsWith('.jpg') ||
        url.endsWith('.ico')
      )
    },
  }
}

/**
 * This plugins is low overhead rate limiter for your routes.
 *
 * @see {@link https://github.com/fastify/fastify-rate-limit}
 */
export default fastifyRateLimit
