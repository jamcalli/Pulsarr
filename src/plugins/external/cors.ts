import fp from 'fastify-plugin'
import cors from '@fastify/cors'
import type { FastifyInstance } from 'fastify'
import type { FastifyCorsOptions } from '@fastify/cors'

const createCorsConfig = (fastify: FastifyInstance): FastifyCorsOptions => {
  const urlObject = new URL(fastify.config.baseUrl)
  const isLocal =
    urlObject.hostname === 'localhost' || urlObject.hostname === '127.0.0.1'
  const protocol = urlObject.protocol
  const domain = urlObject.hostname

  const origins = (
    isLocal
      ? [
          // Local development origins
          `http://localhost:${fastify.config.port}`,
          `https://localhost:${fastify.config.port}`,
          `http://127.0.0.1:${fastify.config.port}`,
          `https://127.0.0.1:${fastify.config.port}`,
          // Include specific development ports if needed
          'http://localhost:3003',
          'http://127.0.0.1:3003',
        ]
      : [
          // Production origin
          `${protocol}//${domain}`,
          fastify.config.port
            ? `${protocol}//${domain}:${fastify.config.port}`
            : undefined,
        ]
  ).filter(
    (origin): origin is string => origin !== null && origin !== undefined,
  )

  return {
    origin: origins,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: true,
    maxAge: 86400,
    allowedHeaders: [
      'Origin',
      'X-Requested-With',
      'Content-Type',
      'Accept',
      'Authorization',
    ],
    exposedHeaders: ['Content-Range', 'X-Content-Range'],
  }
}

export default fp(
  async (fastify: FastifyInstance) => {
    await fastify.register(cors, createCorsConfig(fastify))
  },
  {
    dependencies: ['config'],
  },
)
