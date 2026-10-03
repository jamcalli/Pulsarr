import { hasValidPlexTokens } from '@services/plex-watchlist/api/helpers.js'
import { getAuthBypassStatus } from '@utils/auth-bypass.js'
import { assignTemporaryAdminUser } from '@utils/temporary-admin.js'
import { normalizeBasePath } from '@utils/url.js'
import type { FastifyInstance } from 'fastify'

export default async function rootRoute(fastify: FastifyInstance) {
  const buildPath = (path: string): string => {
    const basePath = normalizeBasePath(fastify.config.basePath)
    if (basePath === '/') return path
    return `${basePath}${path}`
  }

  fastify.get('/', async (request, reply) => {
    if (request.user) {
      if (hasValidPlexTokens(fastify.config)) return reply.html()
      return reply.redirect(buildPath('/plex/configuration'))
    }

    const { isAuthDisabled, isLocalBypass } = getAuthBypassStatus(
      fastify,
      request,
    )

    if (isAuthDisabled || isLocalBypass) {
      const adminUser = await fastify.db.getAdminUser()

      if (adminUser) {
        assignTemporaryAdminUser(request, adminUser)

        if (hasValidPlexTokens(fastify.config)) return reply.html()
        return reply.redirect(buildPath('/plex/configuration'))
      }

      return reply.redirect(buildPath('/create-user'))
    }

    const hasUsers = await fastify.db.hasAdminUsers()
    return reply.redirect(buildPath(hasUsers ? '/login' : '/create-user'))
  })
}
