import fp from 'fastify-plugin'
import helmet from '@fastify/helmet'
import type { FastifyInstance } from 'fastify'
import type { FastifyHelmetOptions } from '@fastify/helmet'

const createHelmetConfig = (allowIframes: boolean): FastifyHelmetOptions => ({
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
  frameguard: allowIframes
    ? false
    : {
        action: 'sameorigin',
      },
})

export default fp(
  async (fastify: FastifyInstance) => {
    await fastify.register(
      helmet,
      createHelmetConfig(fastify.config.allowIframes),
    )
  },
  {
    name: 'helmet-plugin',
    dependencies: ['config'],
  },
)
