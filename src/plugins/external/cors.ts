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

  // Generate origins based on config
  const origins = (
    isLocal
      ? [
          // Local development origins with ports
          `http://localhost:${fastify.config.port}`,
          `https://localhost:${fastify.config.port}`,
          `http://127.0.0.1:${fastify.config.port}`,
          `https://127.0.0.1:${fastify.config.port}`,
          // Include specific development ports if needed
          'http://localhost:3003',
          'http://127.0.0.1:3003',
        ]
      : [
          // Production origins - both with and without port
          `${protocol}//${domain}`, // For Nginx/domain access
          `${protocol}//${domain}:${fastify.config.port}`, // For direct IP:port access
          // Include both HTTP and HTTPS for flexibility
          `http://${domain}:${fastify.config.port}`,
          `https://${domain}:${fastify.config.port}`,
        ]
  ).filter(
    (origin): origin is string => origin !== null && origin !== undefined,
  )

  return {
    origin: origins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: [
      'Origin',
      'X-Requested-With',
      'Content-Type',
      'Accept',
      'Authorization',
    ],
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
