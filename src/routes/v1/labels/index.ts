import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import plexLabelsRoute from '@routes/v1/labels/plex-labels.js'

const labelsPlugin: FastifyPluginAsyncZod = async (fastify) => {
  // Register plex labels routes directly under /labels path
  await fastify.register(plexLabelsRoute)
}

export default labelsPlugin
