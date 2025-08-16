import plexLabelsRoute from '@routes/v1/labels/plex-labels.js'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

const labelsPlugin: FastifyPluginAsyncZod = async (fastify) => {
  // Register plex labels routes directly under /labels path
  await fastify.register(plexLabelsRoute)
}

export default labelsPlugin
