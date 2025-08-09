import type { FastifyPluginAsync } from 'fastify'
import fp from 'fastify-plugin'
import { UserTagService } from '@services/user-tag.service.js'

/**
 * Plugin to register the user tag service
 */
const userTagPlugin: FastifyPluginAsync = async (fastify, opts) => {
  // Create the user tag service
  const userTagService = new UserTagService(fastify.log, fastify)

  fastify.decorate('userTags', userTagService)
}

export default fp(userTagPlugin, {
  name: 'user-tag',
  dependencies: ['database', 'sonarr-manager', 'radarr-manager', 'progress'],
})

// Add type definitions
declare module 'fastify' {
  interface FastifyInstance {
    userTags: UserTagService
  }
}
