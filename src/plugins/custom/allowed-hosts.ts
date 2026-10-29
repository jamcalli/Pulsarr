import {
  buildAllowedHostSet,
  hostnameFromHostHeader,
  isAllowedHost,
} from '@utils/allowed-hosts.js'
import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'

async function allowedHosts(fastify: FastifyInstance) {
  if (fastify.config.allowedHosts.length === 0) {
    return
  }

  const allowed = buildAllowedHostSet(fastify.config.allowedHosts)
  fastify.addHook('onRequest', async (request) => {
    // request.hostname follows X-Forwarded-Host from any trusted peer, so the raw Host header must pass too
    const rawHostname = hostnameFromHostHeader(request.headers.host)
    if (
      rawHostname === null ||
      !isAllowedHost(rawHostname, allowed) ||
      !isAllowedHost(request.hostname, allowed)
    ) {
      throw fastify.httpErrors.badRequest('Host not allowed')
    }
  })
}

export default fp(allowedHosts, {
  name: 'allowed-hosts',
  dependencies: ['config'],
})
