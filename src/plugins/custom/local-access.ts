import { UNAUTHENTICATED_MESSAGE } from '@root/plugins/custom/session.js'
import { getAuthBypassStatus } from '@utils/auth-bypass.js'
import { assignTemporaryAdminUser } from '@utils/temporary-admin.js'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import fp from 'fastify-plugin'

declare module 'fastify' {
  interface FastifyInstance {
    /** Auth strategy for the authenticationMethod bypass rules, signing the request in as the admin when it passes. */
    verifyLocalAccess: (request: FastifyRequest) => Promise<void>
  }
}

async function localAccess(fastify: FastifyInstance) {
  fastify.decorate('verifyLocalAccess', async (request: FastifyRequest) => {
    const { shouldBypass, isAuthDisabled } = getAuthBypassStatus(
      fastify,
      request,
    )
    if (!shouldBypass) {
      throw fastify.httpErrors.unauthorized(UNAUTHENTICATED_MESSAGE)
    }

    if (isAuthDisabled) {
      fastify.log.debug(
        { url: request.url },
        'Authentication disabled globally',
      )
    } else {
      fastify.log.debug(
        { ip: request.ip, url: request.url },
        'Bypassing authentication for local address',
      )
    }
    assignTemporaryAdminUser(request, await fastify.db.getAdminUser())
  })
}

export default fp(localAccess, {
  name: 'local-access',
  dependencies: ['config', 'database', 'session'],
})
