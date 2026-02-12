import { hasValidPlexTokens } from '@services/plex-watchlist/index.js'
import { getAuthBypassStatus } from '@utils/auth-bypass.js'
import { createTemporaryAdminSession } from '@utils/session.js'
import { normalizeBasePath } from '@utils/url.js'
import type { FastifyInstance } from 'fastify'

/**
 * SPA catch-all route handler.
 * Must be registered last (after all other routes) to act as a catch-all.
 * Handles client-side routing authentication and redirects.
 */
export default async function spaRoute(fastify: FastifyInstance) {
  // Helper to build paths with basePath prefix
  const buildPath = (path: string): string => {
    const basePath = normalizeBasePath(fastify.config.basePath)
    if (basePath === '/') return path
    return `${basePath}${path}`
  }

  fastify.get(
    '/*',
    {
      preHandler: async (request, reply) => {
        // Normalize request path (strip query + basePath)
        const rawPath = request.url.split('?')[0] ?? request.url
        const basePath = normalizeBasePath(fastify.config.basePath)
        const hasBasePrefix =
          basePath !== '/' &&
          (rawPath === basePath || rawPath.startsWith(`${basePath}/`))
        const path = hasBasePrefix
          ? rawPath.slice(basePath.length) || '/'
          : rawPath

        // Skip API routes and static assets — ensure we do NOT fall through to SPA HTML
        const lastSeg = path.split('/').pop() ?? ''
        if (
          path === '/v1' ||
          path.startsWith('/v1/') ||
          path === '/favicon.ico' ||
          lastSeg.includes('.')
        ) {
          return reply.callNotFound()
        }

        // Only serve SPA for HTML navigations; return 404 for non-HTML (e.g., XHR/fetch)
        const accept = request.headers.accept ?? ''
        if (typeof accept === 'string' && !accept.includes('text/html')) {
          return reply.callNotFound()
        }

        // Get auth bypass status first
        const { isAuthDisabled, isLocalBypass } = getAuthBypassStatus(
          fastify,
          request,
        )

        // When using basePath prefix, request.url includes the prefix
        const createUserPath =
          basePath === '/' ? '/create-user' : `${basePath}/create-user`
        const loginPath = basePath === '/' ? '/login' : `${basePath}/login`

        const isCreateUserPage = rawPath === createUserPath
        const isLoginPage = rawPath === loginPath

        // Use the in-memory config to check if Plex tokens are configured
        const hasPlexTokens = hasValidPlexTokens(fastify.config)

        // CASE 1: Auth disabled or local IP bypass — create temp session
        if (isAuthDisabled || isLocalBypass) {
          if (request.session.user) {
            if (isLoginPage || isCreateUserPage) {
              return reply.redirect(
                buildPath(hasPlexTokens ? '/dashboard' : '/plex/configuration'),
              )
            }

            return
          }

          const hasUsers = await fastify.db.hasAdminUsers()

          if (hasUsers) {
            createTemporaryAdminSession(request)

            if (isLoginPage || isCreateUserPage) {
              return reply.redirect(
                buildPath(hasPlexTokens ? '/dashboard' : '/plex/configuration'),
              )
            }

            return
          }

          if (!isCreateUserPage) {
            return reply.redirect(buildPath('/create-user'))
          }

          return
        }

        // CASE 2: User already has a session
        if (request.session.user) {
          if (isLoginPage || isCreateUserPage) {
            return reply.redirect(
              buildPath(hasPlexTokens ? '/dashboard' : '/plex/configuration'),
            )
          }

          return
        }

        // Check if users exist - needed for remaining cases
        const hasUsers = await fastify.db.hasAdminUsers()

        // CASE 4: Normal auth flow - no bypassing
        if (!hasUsers) {
          // No users exist yet, force create-user page
          if (!isCreateUserPage) {
            return reply.redirect(buildPath('/create-user'))
          }

          // Allow access to create-user page
          return
        }

        // CASE 5: Users exist, normal auth flow
        // Prevent create-user access when users already exist
        if (isCreateUserPage) {
          return reply.redirect(buildPath('/login'))
        }

        // If trying to access any page other than login, redirect to login
        if (!isLoginPage) {
          return reply.redirect(buildPath('/login'))
        }

        // Allow access to login page
      },
    },
    (_req, reply) => {
      return reply.html()
    },
  )
}
