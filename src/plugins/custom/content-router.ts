import fp from 'fastify-plugin'
import type { FastifyInstance } from 'fastify'
import { ContentRouterService } from '@services/content-router.service.js'

declare module 'fastify' {
  interface FastifyInstance {
    contentRouter: ContentRouterService
  }
}

export default fp(
  async (fastify: FastifyInstance) => {
    fastify.log.info('Initializing content router plugin')

    const routerService = new ContentRouterService(fastify.log, fastify)
    await routerService.initialize()

    fastify.decorate('contentRouter', routerService)

    const pluginNames = routerService
      .getLoadedEvaluators()
      .map((p) => p.name)
      .join(', ')
    fastify.log.info(`Content router initialized with plugins: ${pluginNames}`)
  },
  {
    name: 'content-router',
    dependencies: ['database', 'sonarr-manager', 'radarr-manager'],
  },
)
