import type { FastifyInstance } from 'fastify'

export default async function (fastify: FastifyInstance) {
  fastify.addHook('onRequest', async (request, reply) => {
    const publicPaths = [
      '/v1/users/login',
      '/v1/users/create-admin',
      '/v1/notifications/webhook'
    ]

    if (publicPaths.some(path => request.url.startsWith(path))) {
      return
    }

    if (!request.session.user) {
      reply.unauthorized('You must be authenticated to access this route.')
    }
  })
}