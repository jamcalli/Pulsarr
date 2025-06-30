import path from 'node:path'
import fastifyAutoload from '@fastify/autoload'
import FastifyFormBody from '@fastify/formbody'
import type { FastifyInstance, FastifyPluginOptions } from 'fastify'
import fp from 'fastify-plugin'

// Mock service declarations for OpenAPI generation
declare module 'fastify' {
  interface FastifyInstance {
    db: Record<string, unknown>
    approvalService: Record<string, unknown>
    quotaService: Record<string, unknown>
    radarrManager: Record<string, unknown>
    sonarrManager: Record<string, unknown>
    discord: Record<string, unknown>
    contentRouter: Record<string, unknown>
    plexWatchlist: Record<string, unknown>
    progress: Record<string, unknown>
    tautulli: Record<string, unknown>
    deleteSync: Record<string, unknown>
    scheduler: Record<string, unknown>
    plexSessionMonitor: Record<string, unknown>
    sync: Record<string, unknown>
    userTags: Record<string, unknown>
    updateConfig: Record<string, unknown>
    compare: Record<string, unknown>
    hash: Record<string, unknown>
    watchlistWorkflow: Record<string, unknown>
  }
}

/**
 * Configures a minimal Fastify application for OpenAPI (Swagger) generation.
 *
 * Registers only essential plugins and routes required for OpenAPI documentation, excluding database connections and runtime services. Sets up basic form body parsing, loads only relevant plugins and routes, and defines simple error and 404 handlers suitable for OpenAPI schema generation.
 *
 * @remark
 * This setup is intended for OpenAPI generation and should not be used as a full application runtime, as it omits authentication, database, and service dependencies.
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

  // Register mock services for OpenAPI generation (after env plugin loads)
  await fastify.register(
    fp(async (fastify: FastifyInstance) => {
      // Mock database service
      fastify.decorate('db', {})

      // Mock approval service
      fastify.decorate('approvalService', {})

      // Mock quota service
      fastify.decorate('quotaService', {})

      // Mock manager services
      fastify.decorate('radarrManager', {})
      fastify.decorate('sonarrManager', {})

      // Mock other services (only add those that don't already exist)
      try {
        fastify.decorate('discord', {})
      } catch {} // May already exist
      try {
        fastify.decorate('contentRouter', {})
      } catch {} // May already exist
      try {
        fastify.decorate('plexWatchlist', {})
      } catch {} // May already exist
      try {
        fastify.decorate('progress', {})
      } catch {} // May already exist
      try {
        fastify.decorate('tautulli', {})
      } catch {} // May already exist
      try {
        fastify.decorate('deleteSync', {})
      } catch {} // May already exist
      try {
        fastify.decorate('scheduler', {})
      } catch {} // May already exist
      try {
        fastify.decorate('plexSessionMonitor', {})
      } catch {} // May already exist
      try {
        fastify.decorate('sync', {})
      } catch {} // May already exist
      try {
        fastify.decorate('userTags', {})
      } catch {} // May already exist
      try {
        fastify.decorate('updateConfig', () => {})
      } catch {} // May already exist
      try {
        fastify.decorate('compare', () => {})
      } catch {} // May already exist
      try {
        fastify.decorate('hash', () => {})
      } catch {} // May already exist
      try {
        fastify.decorate('watchlistWorkflow', {})
      } catch {} // May already exist
    }),
  )

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

  // Simple error handler for OpenAPI generation
  fastify.setErrorHandler((err, _request, reply) => {
    const statusCode = err.statusCode ?? 500
    reply.code(statusCode)

    // For OpenAPI generation, we want to see errors to fix schema issues
    // but still protect against exposing sensitive server errors
    const message =
      statusCode >= 500 ? 'Internal Server Error' : err.message || 'Bad Request'

    return { message }
  })

  // Simple 404 handler
  fastify.setNotFoundHandler((_request, reply) => {
    reply.code(404)
    return { message: 'Not Found' }
  })
}
