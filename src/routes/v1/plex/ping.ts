import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { pingSchema } from '@schemas/plex/ping.schema.js'

export const pingRoute: FastifyPluginAsyncZod = async (fastify, _opts) => {
  fastify.route({
    method: 'GET',
    url: '/ping',
    schema: pingSchema,
    handler: async (_request, reply) => {
      try {
        const success = await fastify.plexWatchlist.pingPlex()
        reply.send({ success })
      } catch (err) {
        fastify.log.error(err)
        reply.code(500).send({ success: false })
      }
    },
  })
}
