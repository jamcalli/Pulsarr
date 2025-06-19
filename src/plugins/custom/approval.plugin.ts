import type { FastifyPluginAsync } from 'fastify'
import fp from 'fastify-plugin'
import { ApprovalService } from '@services/approval.service.js'

/**
 * Plugin to register the approval workflow service
 */
const approvalPlugin: FastifyPluginAsync = async (fastify, opts) => {
  // Create the approval service
  const approvalService = new ApprovalService(fastify)

  fastify.decorate('approvalService', approvalService)
}

export default fp(approvalPlugin, {
  name: 'approval',
  dependencies: ['database', 'quota'],
})

// Add type definitions
declare module 'fastify' {
  interface FastifyInstance {
    approvalService: ApprovalService
  }
}
