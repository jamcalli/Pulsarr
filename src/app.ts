import path from 'node:path'
import { resolve } from 'node:path'
import fastifyAutoload from '@fastify/autoload'
import FastifyVite from '@fastify/vite'
import type { FastifyInstance, FastifyPluginOptions } from 'fastify'
import FastifyFormBody from '@fastify/formbody'
import { isLocalIpAddress } from '@utils/ip.js'
import { createTemporaryAdminSession } from '@utils/session.js'

export const options = {
  ajv: {
    customOptions: {
      coerceTypes: 'array',
      removeAdditional: 'all',
    },
  },
}

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
  })

  fastify.get('/', async (request, reply) => {
    // Check for existing session
    if (request.session.user) {
      return reply.redirect('/app/dashboard')
    }

    // Check authentication method setting
    const authMethod = fastify.config.authenticationMethod
    const isAuthDisabled = authMethod === 'disabled'
    const isLocalBypass =
      authMethod === 'requiredExceptLocal' && isLocalIpAddress(request.ip)

    if (isAuthDisabled || isLocalBypass) {
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
        // Check authentication method setting
        const authMethod = fastify.config.authenticationMethod
        const isAuthDisabled = authMethod === 'disabled'
        const isLocalBypass =
          authMethod === 'requiredExceptLocal' && isLocalIpAddress(request.ip)

        // For login and create-user pages
        if (
          request.url === '/app/login' ||
          request.url === '/app/create-user'
        ) {
          if (request.session.user || isAuthDisabled || isLocalBypass) {
            return reply.redirect('/app/dashboard')
          }

          const hasUsers = await fastify.db.hasAdminUsers()

          if (!hasUsers && request.url === '/app/login') {
            return reply.redirect('/app/create-user')
          }

          if (hasUsers && request.url === '/app/create-user') {
            return reply.redirect('/app/login')
          }

          return
        }

        // For all other app pages
        if (!request.session.user) {
          // If auth is disabled or this is a local connection with local bypass
          if (isAuthDisabled || isLocalBypass) {
            // Create a temporary session for the current request only
            const hasUsers = await fastify.db.hasAdminUsers()

            if (hasUsers) {
              // Use a temporary session
              createTemporaryAdminSession(request)
            } else {
              // No users exist yet, redirect to create user
              return reply.redirect('/app/create-user')
            }
          } else {
            // Regular auth required - redirect to login
            return reply.redirect('/app/login')
          }
        }
      },
    },
    (req, reply) => {
      return reply.html()
    },
  )

  await fastify.vite.ready()
}
