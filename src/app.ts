import path, { resolve } from 'node:path'
import fastifyAutoload from '@fastify/autoload'
import FastifyFormBody from '@fastify/formbody'
import FastifyVite from '@fastify/vite'
import type { FastifyInstance, FastifyPluginOptions } from 'fastify'
import fp from 'fastify-plugin'
import { serializerCompiler, validatorCompiler } from 'fastify-zod-openapi'

async function serviceApp(
  fastify: FastifyInstance,
  opts: FastifyPluginOptions,
) {
  fastify.setValidatorCompiler(validatorCompiler)
  fastify.setSerializerCompiler(serializerCompiler)

  fastify.register(FastifyFormBody)

  await fastify.register(fastifyAutoload, {
    dir: path.join(import.meta.dirname, 'plugins/external'),
    options: {
      ...opts,
      timeout: 30000,
    },
  })

  fastify.register(fastifyAutoload, {
    dir: path.join(import.meta.dirname, 'plugins/custom'),
    options: {
      ...opts,
      timeout: 30000,
    },
  })

  fastify.register(fastifyAutoload, {
    dir: path.join(import.meta.dirname, 'routes'),
    autoHooks: true,
    cascadeHooks: true,
    options: {
      ...opts,
      timeout: 30000,
    },
  })

  if (process.env.NODE_ENV !== 'test') {
    await fastify.register(FastifyVite, {
      root: resolve(import.meta.dirname, '../'),
      dev: process.argv.includes('--dev'),
      spa: true,
      distDir: 'dist',
      prefix: opts.prefix || '/',
    })

    await fastify.vite.ready()
  }
}

export default fp(serviceApp)
