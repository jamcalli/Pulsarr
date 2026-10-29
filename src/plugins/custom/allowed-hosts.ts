import { buildAllowedHostSet, isAllowedHost } from '@utils/allowed-hosts.js'
import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'

async function allowedHosts(fastify: FastifyInstance) {
  if (fastify.config.allowedHosts.length === 0) {
    return
  }

  const allowed = buildAllowedHostSet(fastify.config.allowedHosts)
  fastify.addHook('onRequest', async (request) => {
    if (!isAllowedHost(request.hostname, allowed)) {
      throw fastify.httpErrors.badRequest('Host not allowed')
    }
  })
}

export default fp(allowedHosts, {
  name: 'allowed-hosts',
  dependencies: ['config'],
})
