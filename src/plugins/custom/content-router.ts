import fp from 'fastify-plugin'
import type { FastifyInstance } from 'fastify'
import { ContentRouterService } from '@services/content-router.service.js'

declare module 'fastify' {
  interface FastifyInstance {
    contentRouter: ContentRouterService
  }
}

/**
 * Plugin that registers the ContentRouterService with the Fastify application.
 *
 * This service handles routing content items to Radarr and Sonarr instances
 * based on complex query conditions.
 */
export default fp(
  async (fastify: FastifyInstance) => {
    fastify.log.info('Initializing content router plugin')

    const routerService = new ContentRouterService(fastify.log, fastify)

    fastify.decorate('contentRouter', routerService)

    const predicatePlugins = routerService.getLoadedPredicatePlugins()
    const pluginNames = predicatePlugins.map((p) => p.name).join(', ')

    fastify.log.info(
      `Content router initialized with predicate plugins: ${pluginNames}`,
    )
  },
  {
    name: 'content-router',
    dependencies: ['database', 'sonarr-manager', 'radarr-manager'],
  },
)
