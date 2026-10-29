import cors from '@fastify/cors'
import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'

export default fp(
  async (fastify: FastifyInstance) => {
    const { allowedOrigins } = fastify.config
    if (allowedOrigins.length === 0) {
      return
    }

    await fastify.register(cors, {
      // Answering false omits every CORS header for an unlisted origin, which an origin array does not
      origin: (origin, callback) =>
        callback(null, origin !== undefined && allowedOrigins.includes(origin)),
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: [
        'Origin',
        'X-Requested-With',
        'Content-Type',
        'Accept',
        'Authorization',
        'X-API-Key',
      ],
    })
  },
  {
    dependencies: ['config'],
  },
)
