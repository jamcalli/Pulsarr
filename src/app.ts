import path from 'node:path'
import { resolve } from 'node:path'
import fastifyAutoload from '@fastify/autoload'
import FastifyVite from '@fastify/vite'
import type { FastifyInstance, FastifyPluginOptions } from 'fastify'
import FastifyFormBody from '@fastify/formbody'
import { getAuthBypassStatus } from '@utils/auth-bypass.js'
import { createTemporaryAdminSession } from '@utils/session.js'
import { hasValidPlexTokens } from '@utils/plex.js'

export const options = {
  ajv: {
    customOptions: {
      coerceTypes: 'array',
      removeAdditional: 'all',
    },
  },
}

/**
 * Sets up the Fastify server with plugin autoloading, SPA integration, global error and 404 handling, and authentication-aware routing with conditional redirection.
 *
 * Registers middleware for form body parsing, loads external and custom plugins, and autoloads route handlers. Integrates Vite for serving a single-page application. Implements global error and not-found handlers with logging and rate limiting. Defines root and app routes that manage user sessions, authentication bypass, and redirects based on user existence and Plex token configuration.
 *
 * @remark
 * Authentication can be bypassed if disabled in configuration or for local IPs. In these cases, a temporary admin session is created if admin users exist; otherwise, users are redirected to create a user account. Redirects after authentication checks depend on whether Plex tokens are configured, sending users to the dashboard or Plex setup page accordingly.
 */
export default async function serviceApp(
  fastify: FastifyInstance,
  opts: FastifyPluginOptions,
) {
  // Basic setup
  fastify.register(FastifyFormBody)

  // Load external plugins
  await fastify.register(fastifyAutoload, {
    dir: path.join(import.meta.dirname, 'plugins/external'),
    options: {
      ...opts,
      timeout: 30000,
    },
  })

  // Load custom plugins
  fastify.register(fastifyAutoload, {
    dir: path.join(import.meta.dirname, 'plugins/custom'),
    options: {
      ...opts,
      timeout: 30000,
    },
  })

  // Load routes
  fastify.register(fastifyAutoload, {
    dir: path.join(import.meta.dirname, 'routes'),
    autoHooks: true,
    cascadeHooks: true,
    options: {
      ...opts,
      timeout: 30000,
    },
  })

  // Error handler
  fastify.setErrorHandler((err, request, reply) => {
    fastify.log.error(
      {
        err,
        request: {
          method: request.method,
          url: request.url,
          query: request.query,
          params: request.params,
        },
      },
      'Unhandled error occurred',
    )
    reply.code(err.statusCode ?? 500)
    let message = 'Internal Server Error'
    if (err.statusCode && err.statusCode < 500) {
      message = err.message
    }
    return { message }
  })

  // 404 handler with rate limiting
  fastify.setNotFoundHandler(
    {
      preHandler: fastify.rateLimit({
        max: 3,
        timeWindow: 500,
      }),
    },
    (request, reply) => {
      request.log.warn(
        {
          request: {
            method: request.method,
            url: request.url,
            query: request.query,
            params: request.params,
          },
        },
        'Resource not found',
      )
      reply.code(404)
      return { message: 'Not Found' }
    },
  )


  // Handle the root route
  fastify.get('/', async (request, reply) => {
    // Check for existing session
    if (request.session.user) {
      // Use the in-memory config instead of querying the database
      const hasPlexTokens = hasValidPlexTokens(fastify.config)
      return reply.redirect(hasPlexTokens ? '/app/dashboard' : '/app/plex')
    }

    // Check authentication method setting
    const { isAuthDisabled, isLocalBypass } = getAuthBypassStatus(
      fastify,
      request,
    )

    // CASE 1: Auth is completely disabled - no user account needed
    if (isAuthDisabled) {
      // Only create a temporary session if one doesn't already exist
      if (!request.session.user) {
        createTemporaryAdminSession(request)
      }

      // Check if Plex tokens are configured
      const hasPlexTokens = hasValidPlexTokens(fastify.config)

      return reply.redirect(hasPlexTokens ? '/app/dashboard' : '/app/plex')
    }

    // CASE 2: Local IP bypass is active
    if (isLocalBypass) {
      const hasUsers = await fastify.db.hasAdminUsers()

      if (hasUsers) {
        // Only create a temporary session if one doesn't already exist
        if (!request.session.user) {
          createTemporaryAdminSession(request)
        }

        // Check if Plex tokens are configured
        const hasPlexTokens = hasValidPlexTokens(fastify.config)

        return reply.redirect(hasPlexTokens ? '/app/dashboard' : '/app/plex')
      }

      // No users exist yet with local bypass, redirect to create user
      return reply.redirect('/app/create-user')
    }

    // CASE 3: Normal flow
    const hasUsers = await fastify.db.hasAdminUsers()
    return reply.redirect(hasUsers ? '/app/login' : '/app/create-user')
  })

  
  // Register SPA routes
  fastify.get(
    '/app/*',
    {
      preHandler: async (request, reply) => {
        // Get auth bypass status first
        const { isAuthDisabled, isLocalBypass } = getAuthBypassStatus(
          fastify,
          request,
        )

        const isCreateUserPage = request.url.endsWith('/app/create-user')
        const isLoginPage = request.url.endsWith('/app/login')

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
              hasPlexTokens ? '/app/dashboard' : '/app/plex',
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
              hasPlexTokens ? '/app/dashboard' : '/app/plex',
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
                hasPlexTokens ? '/app/dashboard' : '/app/plex',
              )
            }

            // Allow access to all other pages with the temp session
            return
          }

          // No users exist yet with local bypass, force create-user page
          if (!isCreateUserPage) {
            return reply.redirect('/app/create-user')
          }

          // Allow access to create-user page
          return
        }

        // CASE 4: Normal auth flow - no bypassing
        if (!hasUsers) {
          // No users exist yet, force create-user page
          if (!isCreateUserPage) {
            return reply.redirect('/app/create-user')
          }

          // Allow access to create-user page
          return
        }

        // CASE 5: Users exist, normal auth flow
        // Prevent create-user access when users already exist
        if (isCreateUserPage) {
          return reply.redirect('/app/login')
        }

        // If trying to access any page other than login, redirect to login
        if (!isLoginPage) {
          return reply.redirect('/app/login')
        }

        // Allow access to login page
      },
    },
    (req, reply) => {
      return reply.html()
    },
  )

  // FastifyVite is the core of the app - register it at the end
  await fastify.register(FastifyVite, {
    root: resolve(import.meta.dirname, '../'),
    dev: process.argv.includes('--dev'),
    spa: true,
    distDir: 'dist/client',
  })
  
  await fastify.vite.ready()
}
