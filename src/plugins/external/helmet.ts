import fp from 'fastify-plugin'
import helmet from '@fastify/helmet'
import type { FastifyInstance } from 'fastify'
import type { FastifyHelmetOptions } from '@fastify/helmet'

const createHelmetConfig = (): FastifyHelmetOptions => ({
  global: true,
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: false,
  crossOriginOpenerPolicy: false,
  hsts: false,

  hidePoweredBy: true,
  noSniff: true,
  dnsPrefetchControl: {
    allow: false,
  },
  frameguard: {
    action: 'sameorigin',
  },
})

export default fp(
  async (fastify: FastifyInstance) => {
    await fastify.register(helmet, createHelmetConfig())
  },
  {
    name: 'helmet-plugin',
    dependencies: ['config'],
  },
)
