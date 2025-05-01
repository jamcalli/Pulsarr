import path from 'node:path'
import { resolve } from 'node:path'
import fastifyAutoload from '@fastify/autoload'
import FastifyVite from '@fastify/vite'
import type { FastifyInstance, FastifyPluginOptions } from 'fastify'
import FastifyFormBody from '@fastify/formbody'
import { getAuthBypassStatus } from '@utils/auth-bypass.js'
import { createTemporaryAdminSession } from '@utils/session.js'

export const options = {
  ajv: {
    customOptions: {
      coerceTypes: 'array',
      removeAdditional: 'all',
    },
  },
}

/**
 * Configures the Fastify server with plugin autoloading, Vite SPA integration, global error handling, and authentication-aware routing.
 *
 * Registers middleware for form body parsing, loads external and custom plugins, and sets up route handlers. Integrates Vite for single-page application support. Implements global error and 404 handlers with logging and rate limiting. Defines root and app routes with conditional authentication logic, supporting disabled authentication, local IP bypass, and temporary admin session creation based on user existence and configuration.
 *
 * @remark
 * Authentication can be bypassed for local IPs or when disabled in configuration. If bypass is active and admin users exist, a temporary admin session is created; otherwise, users are redirected to create a user account.
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

  await fastify.register(FastifyVite, {
    root: resolve(import.meta.dirname, '../'),
    dev: process.argv.includes('--dev'),
    spa: true,
    distDir: 'dist/client',
  })

  fastify.get('/', async (request, reply) => {
    // Check for existing session
    if (request.session.user) {
      return reply.redirect('/app/dashboard')
    }

    // Check authentication method setting
    const { isAuthDisabled, isLocalBypass, shouldBypass } = getAuthBypassStatus(
      fastify,
      request,
    )

    // If auth is completely disabled, go directly to dashboard
    if (isAuthDisabled) {
      createTemporaryAdminSession(request)
      return reply.redirect('/app/dashboard')
    }

    // For local IP bypass
    if (isLocalBypass) {
      const hasUsers = await fastify.db.hasAdminUsers()

      if (hasUsers) {
        // Create a temporary session
        createTemporaryAdminSession(request)
        return reply.redirect('/app/dashboard')
      }

      // No users exist yet, redirect to create user
      return reply.redirect('/app/create-user')
    }

    // Normal flow - check if users exist
    const hasUsers = await fastify.db.hasAdminUsers()
    return reply.redirect(hasUsers ? '/app/login' : '/app/create-user')
  })

  fastify.get(
    '/app/*',
    {
      preHandler: async (request, reply) => {
        // Get auth bypass status first
        const { isAuthDisabled, isLocalBypass } = getAuthBypassStatus(
          fastify,
          request,
        )

        const isCreateUserPage = request.url === '/app/create-user'
        const isLoginPage = request.url === '/app/login'

        // CASE 1: Auth is completely disabled - create temp session and allow access
        if (isAuthDisabled) {
          if (isCreateUserPage || isLoginPage) {
            return reply.redirect('/app/dashboard')
          }
          createTemporaryAdminSession(request)
          return // Allow access with temp session
        }

        // CASE 2: User already has a session - they can access anything except login/create
        if (request.session.user) {
          if (isCreateUserPage || isLoginPage) {
            return reply.redirect('/app/dashboard')
          }
          return // Allow access to requested page
        }

        // Check if users exist - only needed for remaining cases
        const hasUsers = await fastify.db.hasAdminUsers()

        // CASE 3: Local IP bypass is active
        if (isLocalBypass) {
          if (hasUsers) {
            if (isCreateUserPage || isLoginPage) {
              return reply.redirect('/app/dashboard')
            }
            createTemporaryAdminSession(request)
            return // Allow access with temp session
          }

          // With local bypass but no users
          if (!isCreateUserPage) {
            return reply.redirect('/app/create-user')
          }
          return // Allow access to create-user page
        }

        // CASE 4: Normal auth flow - no bypassing
        if (!hasUsers) {
          // No users exist yet, force create-user page
          if (!isCreateUserPage) {
            return reply.redirect('/app/create-user')
          }
          return // Allow access to create-user page
        }

        // CASE 5: Users exist, normal auth - redirect to login
        if (!isLoginPage && !isCreateUserPage) {
          return reply.redirect('/app/login')
        }

        // Prevent create-user access when users already exist
        if (isCreateUserPage) {
          return reply.redirect('/app/login')
        }

        // Allow access to login page by default
      },
    },
    (req, reply) => {
      return reply.html()
    },
  )

  await fastify.vite.ready()
}
