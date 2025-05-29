import path from 'node:path'
import fastifyAutoload from '@fastify/autoload'
import FastifyFormBody from '@fastify/formbody'
import type { FastifyInstance, FastifyPluginOptions } from 'fastify'

/**
 * Minimal Fastify app configuration for OpenAPI generation only.
 *
 * Loads only the essential plugins (swagger, routes) without database,
 * services, or other runtime dependencies that require actual connections.
 */
export default async function openapiApp(
  fastify: FastifyInstance,
  opts: FastifyPluginOptions,
) {
  // Basic form body parsing
  fastify.register(FastifyFormBody)

  // Only load external plugins needed for swagger
  await fastify.register(fastifyAutoload, {
    dir: path.join(import.meta.dirname, '../src/plugins/external'),
    options: {
      ...opts,
      timeout: 30000,
    },
    // Only load specific plugins we need for OpenAPI
    ignorePattern: /^(?!.*(?:swagger|env|sensible)\.ts$).*\.ts$/,
  })

  // Load routes (they should work without database if we mock the services)
  fastify.register(fastifyAutoload, {
    dir: path.join(import.meta.dirname, '../src/routes'),
    autoHooks: false, // Disable hooks that might depend on auth/db
    cascadeHooks: false,
    options: {
      ...opts,
      timeout: 30000,
    },
  })

  // Simple error handler
  fastify.setErrorHandler((err, request, reply) => {
    reply.code(err.statusCode ?? 500)
    return { message: err.message || 'Internal Server Error' }
  })

  // Simple 404 handler
  fastify.setNotFoundHandler((request, reply) => {
    reply.code(404)
    return { message: 'Not Found' }
  })
}
