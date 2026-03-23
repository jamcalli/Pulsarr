import path from 'node:path'
import fastifyAutoload from '@fastify/autoload'
import FastifyFormBody from '@fastify/formbody'
import type {
  FastifyError,
  FastifyInstance,
  FastifyPluginOptions,
} from 'fastify'
import fp from 'fastify-plugin'
import { serializerCompiler, validatorCompiler } from 'fastify-zod-openapi'

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
    notifications: Record<string, unknown>
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

export default async function openapiApp(
  fastify: FastifyInstance,
  opts: FastifyPluginOptions,
) {
  fastify.setValidatorCompiler(validatorCompiler)
  fastify.setSerializerCompiler(serializerCompiler)

  fastify.register(FastifyFormBody)

  await fastify.register(fastifyAutoload, {
    dir: path.join(import.meta.dirname, '../src/plugins/external'),
    options: {
      ...opts,
      timeout: 30000,
    },
    // Only load specific plugins we need for OpenAPI
    ignorePattern: /^(?!.*(?:swagger|env|sensible)\.ts$).*\.ts$/,
  })

  // Must run after env plugin loads
  await fastify.register(
    fp(async (fastify: FastifyInstance) => {
      fastify.decorate('db', {})
      fastify.decorate('approvalService', {})
      fastify.decorate('quotaService', {})
      fastify.decorate('radarrManager', {})
      fastify.decorate('sonarrManager', {})

      try {
        fastify.decorate('discord', {})
      } catch {}
      try {
        fastify.decorate('contentRouter', {})
      } catch {}
      try {
        fastify.decorate('plexWatchlist', {})
      } catch {}
      try {
        fastify.decorate('progress', {})
      } catch {}
      try {
        fastify.decorate('notifications', {})
      } catch {}
      try {
        fastify.decorate('deleteSync', {})
      } catch {}
      try {
        fastify.decorate('scheduler', {})
      } catch {}
      try {
        fastify.decorate('plexSessionMonitor', {})
      } catch {}
      try {
        fastify.decorate('sync', {})
      } catch {}
      try {
        fastify.decorate('userTags', {})
      } catch {}
      try {
        // @ts-expect-error Stub for OpenAPI generation
        fastify.decorate('updateConfig', () => {})
      } catch {}
      try {
        // @ts-expect-error Stub for OpenAPI generation
        fastify.decorate('compare', () => {})
      } catch {}
      try {
        // @ts-expect-error Stub for OpenAPI generation
        fastify.decorate('hash', () => {})
      } catch {}
      try {
        fastify.decorate('watchlistWorkflow', {})
      } catch {}
    }),
  )

  fastify.register(fastifyAutoload, {
    dir: path.join(import.meta.dirname, '../src/routes'),
    autoHooks: false, // Hooks depend on auth/db which aren't loaded here
    cascadeHooks: false,
    options: {
      ...opts,
      timeout: 30000,
    },
  })

  fastify.setErrorHandler((err: FastifyError, _request, reply) => {
    const statusCode = err.statusCode ?? 500
    reply.code(statusCode)

    // Don't expose internal error details in 5xx responses
    const message =
      statusCode >= 500 ? 'Internal Server Error' : err.message || 'Bad Request'

    return { message }
  })

  fastify.setNotFoundHandler((_request, reply) => {
    reply.code(404)
    return { message: 'Not Found' }
  })
}
