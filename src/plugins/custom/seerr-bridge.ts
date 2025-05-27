import fp from 'fastify-plugin'
import type { FastifyInstance } from 'fastify'
import { SeerrBridgeService } from '@services/seerr-bridge.service.js'

declare module 'fastify' {
  interface FastifyInstance {
    seerrBridge: SeerrBridgeService
  }
}

export default fp(
  async (fastify: FastifyInstance) => {
    const seerrBridgeService = new SeerrBridgeService(fastify)
    fastify.decorate('seerrBridge', seerrBridgeService)

    fastify.addHook('onClose', async () => {
      fastify.log.info('Closing SeerrBridge service...')
    })
  },
  {
    name: 'seerr-bridge',
    dependencies: ['database', 'config'],
  },
)
