import fastifyRateLimit from '@fastify/rate-limit'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import fp from 'fastify-plugin'

const createRateLimitConfig = (fastify: FastifyInstance) => {
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
 * Low overhead rate limiter for routes.
 * Wrapped in fastify-plugin to ensure config dependency loads first under Bun,
 * which has non-deterministic file ordering in fastify-autoload.
 *
 * @see {@link https://github.com/fastify/fastify-rate-limit}
 * @see {@link https://github.com/oven-sh/bun/discussions/10112}
 */
export default fp(
  async (fastify: FastifyInstance) => {
    await fastify.register(fastifyRateLimit, createRateLimitConfig(fastify))
  },
  {
    dependencies: ['config'],
  },
)
