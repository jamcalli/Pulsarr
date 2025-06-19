import type { FastifyPluginAsync } from 'fastify'
import fp from 'fastify-plugin'
import { QuotaService } from '@services/quota.service.js'

/**
 * Plugin to register the quota management service
 */
const quotaPlugin: FastifyPluginAsync = async (fastify, opts) => {
  // Create the quota service
  const quotaService = new QuotaService(fastify)

  fastify.decorate('quotaService', quotaService)
}

export default fp(quotaPlugin, {
  name: 'quota',
  dependencies: ['database'],
})

// Add type definitions
declare module 'fastify' {
  interface FastifyInstance {
    quotaService: QuotaService
  }
}
