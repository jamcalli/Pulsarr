import path, { resolve } from 'node:path'
import fastifyAutoload from '@fastify/autoload'
import FastifyFormBody from '@fastify/formbody'
import FastifyVite from '@fastify/vite'
import type { FastifyInstance, FastifyPluginOptions } from 'fastify'
import fp from 'fastify-plugin'
import { serializerCompiler, validatorCompiler } from 'fastify-zod-openapi'

/**
 * Configures and initializes the Fastify server with plugin autoloading,
 * route handlers, and Vite integration for serving a single-page application.
 */
async function serviceApp(
  fastify: FastifyInstance,
  opts: FastifyPluginOptions,
) {
  // Set Zod compilers for validation and fast-json-stringify serialization
  // Must be set before any routes are registered
  fastify.setValidatorCompiler(validatorCompiler)
  fastify.setSerializerCompiler(serializerCompiler)

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

  // Register Vite for SPA serving - must be last (skip in test environment)
  if (process.env.NODE_ENV !== 'test') {
    await fastify.register(FastifyVite, {
      root: resolve(import.meta.dirname, '../'),
      dev: process.argv.includes('--dev'),
      spa: true,
      distDir: 'dist',
      prefix: opts.prefix,
    })

    await fastify.vite.ready()
  }
}

export default fp(serviceApp)
