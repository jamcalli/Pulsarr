import { ContentRouterService } from '@services/content-router.service.js'
import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'

declare module 'fastify' {
  interface FastifyInstance {
    contentRouter: ContentRouterService
  }
}

export default fp(
  async (fastify: FastifyInstance) => {
    fastify.log.debug('Initializing content router plugin')

    const routerService = new ContentRouterService(fastify.log, fastify)

    try {
      await routerService.initialize()
    } catch (error) {
      fastify.log.error({ error }, 'Failed to initialize content router')
      throw error // Re-throw to prevent server start with broken state
    }

    fastify.decorate('contentRouter', routerService)

    const pluginNames = routerService
      .getLoadedEvaluators()
      .map((p) => p.name)
      .join(', ')
    fastify.log.info(`Content router initialized with plugins: ${pluginNames}`)
  },
  {
    name: 'content-router',
    dependencies: ['database', 'sonarr-manager', 'radarr-manager', 'quota'],
  },
)
