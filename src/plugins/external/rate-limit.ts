import fastifyRateLimit from '@fastify/rate-limit'
import type { FastifyInstance, FastifyRequest } from 'fastify'

export const autoConfig = (fastify: FastifyInstance) => {
  return {
    max: fastify.config.rateLimitMax,
    timeWindow: '1 minute',
    allowList: (req: FastifyRequest) => {
      // Skip rate limiting for static assets (handles both root and prefixed paths)
      // Use pathname only to prevent query string manipulation bypasses
      const pathname = req.url.split('?')[0]
      return (
        pathname.includes('/assets/') ||
        pathname.includes('/favicon') ||
        pathname.endsWith('.js') ||
        pathname.endsWith('.css') ||
        pathname.endsWith('.woff2') ||
        pathname.endsWith('.woff') ||
        pathname.endsWith('.svg') ||
        pathname.endsWith('.png') ||
        pathname.endsWith('.jpg') ||
        pathname.endsWith('.ico')
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
