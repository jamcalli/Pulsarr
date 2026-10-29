import fastifyRateLimit, {
  normalizeIP,
  type RateLimitOptions,
} from '@fastify/rate-limit'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import fp from 'fastify-plugin'

// A route rateLimit config replaces the global limit, so each constant is the endpoint's whole policy
export const CREDENTIAL_RATE_LIMIT: RateLimitOptions = {
  max: 5,
  timeWindow: '1 minute',
}

export const PROBE_RATE_LIMIT: RateLimitOptions = {
  max: 10,
  timeWindow: '1 minute',
}

// Tested against the matched route template, which the router picks and the client cannot rewrite
const STATIC_FILE_ROUTE = /(?:\/assets\/\*|\.\w+)$/

const isStaticFileRoute = (req: FastifyRequest) =>
  req.routeOptions.config.rateLimit === undefined &&
  STATIC_FILE_ROUTE.test(req.routeOptions.url ?? '')

const createRateLimitConfig = (fastify: FastifyInstance) => {
  return {
    max: fastify.config.rateLimitMax,
    timeWindow: '1 minute',
    // The default generator crashes on an undefined req.ip, and a custom one must collapse IPv6 to /64 itself
    keyGenerator: (req: FastifyRequest) =>
      req.ip ? normalizeIP(req.ip, 64) : 'unknown',
    allowList: isStaticFileRoute,
  }
}

export default fp(
  async (fastify: FastifyInstance) => {
    await fastify.register(fastifyRateLimit, createRateLimitConfig(fastify))
  },
  {
    dependencies: ['config'],
  },
)
