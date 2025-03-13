import fp from 'fastify-plugin'
import cors from '@fastify/cors'
import type { FastifyInstance } from 'fastify'
import type { FastifyCorsOptions } from '@fastify/cors'

const createCorsConfig = (fastify: FastifyInstance): FastifyCorsOptions => {
  fastify.log.info(
    `Using baseUrl: ${fastify.config.baseUrl} for service connections`,
  )

  return {
    origin: true,
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
