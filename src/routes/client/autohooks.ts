import type { FastifyInstance } from 'fastify'

export default async function (fastify: FastifyInstance) {
  fastify.addHook('onRequest', async (request, reply) => {
    if (
      request.url.startsWith('/client/users/login') ||
      request.url.startsWith('/client/users/create-admin')
    ) {
      return
    }

    if (!request.session.user) {
      reply.unauthorized('You must be authenticated to access this route.')
    }
  })
}
