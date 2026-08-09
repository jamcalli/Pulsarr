import fastifyRateLimit, {
  normalizeIP,
  type RateLimitOptions,
} from '@fastify/rate-limit'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import fp from 'fastify-plugin'

// Route-level buckets. A route rateLimit config REPLACES the global limit
// rather than stacking, so each constant is the complete policy for the
// endpoints that use it.
export const CREDENTIAL_RATE_LIMIT: RateLimitOptions = {
  max: 5,
  timeWindow: '1 minute',
}

export const PROBE_RATE_LIMIT: RateLimitOptions = {
  max: 10,
  timeWindow: '1 minute',
}

const createRateLimitConfig = (fastify: FastifyInstance) => {
  return {
    max: fastify.config.rateLimitMax,
    timeWindow: '1 minute',
    // the default generator crashes on aborted sockets where req.ip is undefined,
    // and a custom generator skips the plugin's /64 collapsing, so apply it here
    keyGenerator: (req: FastifyRequest) =>
      req.ip ? normalizeIP(req.ip, 64) : 'unknown',
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
