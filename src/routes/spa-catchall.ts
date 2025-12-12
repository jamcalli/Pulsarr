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
        const path =
          basePath !== '/' && rawPath.startsWith(basePath)
            ? rawPath.slice(basePath.length) || '/'
            : rawPath

        // Skip API routes and static assets — ensure we do NOT fall through to SPA HTML
        const lastSeg = path.split('/').pop() ?? ''
        if (
          path.startsWith('/v1/') ||
          path === '/favicon.ico' ||
          lastSeg.includes('.')
        ) {
          reply.callNotFound()
          return
        }

        // Only serve SPA for HTML navigations; return 404 for non-HTML (e.g., XHR/fetch)
        const accept = request.headers.accept ?? ''
        if (typeof accept === 'string' && !accept.includes('text/html')) {
          reply.callNotFound()
          return
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

        // CASE 1: Auth is completely disabled - no user account needed
        if (isAuthDisabled) {
          // Only create a temporary session if one doesn't already exist
          if (!request.session.user) {
            createTemporaryAdminSession(request)
          }

          // If trying to access login or create-user, redirect appropriately
          if (isLoginPage || isCreateUserPage) {
            return reply.redirect(
              buildPath(hasPlexTokens ? '/dashboard' : '/plex/configuration'),
            )
          }

          // Allow access to all other pages with the temp session
          return
        }

        // CASE 2: User already has a session
        if (request.session.user) {
          // If trying to access login or create-user, redirect appropriately
          if (isLoginPage || isCreateUserPage) {
            return reply.redirect(
              buildPath(hasPlexTokens ? '/dashboard' : '/plex/configuration'),
            )
          }

          // Allow access to requested page
          return
        }

        // Check if users exist - needed for remaining cases
        const hasUsers = await fastify.db.hasAdminUsers()

        // CASE 3: Local IP bypass is active
        if (isLocalBypass) {
          if (hasUsers) {
            // Only create a temporary session if one doesn't already exist
            if (!request.session.user) {
              createTemporaryAdminSession(request)
            }

            // If trying to access login or create-user, redirect appropriately
            if (isLoginPage || isCreateUserPage) {
              return reply.redirect(
                buildPath(hasPlexTokens ? '/dashboard' : '/plex/configuration'),
              )
            }

            // Allow access to all other pages with the temp session
            return
          }

          // No users exist yet with local bypass, force create-user page
          if (!isCreateUserPage) {
            return reply.redirect(buildPath('/create-user'))
          }

          // Allow access to create-user page
          return
        }

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
