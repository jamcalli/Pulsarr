import fastifyCookie from '@fastify/cookie'
import fastifySession from '@fastify/session'
import type { Auth } from '@schemas/auth/auth.js'
import fp from 'fastify-plugin'

declare module 'fastify' {
  interface Session {
    user: Auth
  }
  interface FastifyRequest {
    user: Auth | null
  }
}

/**
 * This plugins enables the use of session.
 *
 * @see {@link https://github.com/fastify/session}
 */
export default fp(
  async (fastify) => {
    await fastify.register(fastifyCookie)
    await fastify.register(fastifySession, {
      secret: fastify.config.cookieSecret,
      cookieName: fastify.config.cookieName,
      saveUninitialized: false,
      cookie: {
        secure: fastify.config.cookieSecured,
        httpOnly: true,
        maxAge: 604800000,
      },
    })

    fastify.decorateRequest('user', null)

    // Must register after the session plugin so request.session exists when it runs
    fastify.addHook('onRequest', async (request) => {
      request.user = request.session.user ?? null
    })
  },
  {
    name: 'session',
    // database must load first so the persisted cookieSecret is used
    dependencies: ['config', 'database'],
  },
)
