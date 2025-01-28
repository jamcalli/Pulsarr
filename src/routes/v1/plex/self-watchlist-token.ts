import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { selfWatchlistSchema } from '@schemas/plex/self-watchlist-token.schema.js'

export const selfWatchlistTokenRoute: FastifyPluginAsyncZod = async (
  fastify,
  _opts,
) => {
  fastify.route({
    method: 'GET',
    url: '/self-watchlist-token',
    schema: selfWatchlistSchema,
    handler: async (request, reply) => {
      try {
        const wantsProgress =
          request.headers.accept?.includes('text/event-stream')

        if (wantsProgress) {
          reply.raw.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
          })

          reply.raw.write('event: connect\ndata: connected\n\n')
        }

        const response = await fastify.plexWatchlist.getSelfWatchlist()

        if (wantsProgress) {
          reply.raw.end()
        } else {
          reply.send(response)
        }
      } catch (err) {
        fastify.log.error(err)
        reply.code(500).send({ error: 'Unable to fetch watchlist items' })
      }
    },
  })
}
