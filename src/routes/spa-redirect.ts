import { hasValidPlexTokens } from '@services/plex-watchlist/index.js'
import { getAuthBypassStatus } from '@utils/auth-bypass.js'
import { createTemporaryAdminSession } from '@utils/session.js'
import { normalizeBasePath } from '@utils/url.js'
import type { FastifyInstance } from 'fastify'

/**
 * Root route handler.
 * Manages initial redirects based on authentication state and user existence.
 */
export default async function rootRoute(fastify: FastifyInstance) {
  // Helper to build paths with basePath prefix
  const buildPath = (path: string): string => {
    const basePath = normalizeBasePath(fastify.config.basePath)
    if (basePath === '/') return path
    return `${basePath}${path}`
  }

  fastify.get('/', async (request, reply) => {
    // Check for existing session
    if (request.session.user) {
      // Use the in-memory config instead of querying the database
      const hasPlexTokens = hasValidPlexTokens(fastify.config)
      return reply.redirect(
        buildPath(hasPlexTokens ? '/dashboard' : '/plex/configuration'),
      )
    }

    // Check authentication method setting
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
