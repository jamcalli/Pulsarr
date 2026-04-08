import { hasValidPlexTokens } from '@services/plex-watchlist/index.js'
import { getAuthBypassStatus } from '@utils/auth-bypass.js'
import { createTemporaryAdminSession } from '@utils/session.js'
import { normalizeBasePath } from '@utils/url.js'
import type { FastifyInstance } from 'fastify'

export default async function rootRoute(fastify: FastifyInstance) {
  const buildPath = (path: string): string => {
    const basePath = normalizeBasePath(fastify.config.basePath)
    if (basePath === '/') return path
    return `${basePath}${path}`
  }

  fastify.get('/', async (request, reply) => {
    if (request.session.user) {
      const hasPlexTokens = hasValidPlexTokens(fastify.config)
      return reply.redirect(
        buildPath(hasPlexTokens ? '/dashboard' : '/plex/configuration'),
      )
    }

    const { isAuthDisabled, isLocalBypass } = getAuthBypassStatus(
      fastify,
      request,
    )

    // CASE 1: Auth disabled or local IP bypass — create temp session
    if (isAuthDisabled || isLocalBypass) {
      const hasUsers = await fastify.db.hasAdminUsers()

      if (hasUsers) {
        createTemporaryAdminSession(request)

        const hasPlexTokens = hasValidPlexTokens(fastify.config)

        return reply.redirect(
          buildPath(hasPlexTokens ? '/dashboard' : '/plex/configuration'),
        )
      }

      return reply.redirect(buildPath('/create-user'))
    }

    // CASE 2: Normal flow
    const hasUsers = await fastify.db.hasAdminUsers()
    return reply.redirect(buildPath(hasUsers ? '/login' : '/create-user'))
  })
}
