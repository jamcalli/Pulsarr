import { isLocalClientChain } from '@utils/ip.js'
import type { FastifyInstance, FastifyRequest } from 'fastify'

/** Whether session auth is bypassed globally ('disabled') or for a local client under 'requiredExceptLocal'. */
export function getAuthBypassStatus(
  fastify: FastifyInstance,
  request: FastifyRequest,
) {
  const authMethod = fastify.config.authenticationMethod
  const isAuthDisabled = authMethod === 'disabled'
  const isLocalBypass =
    authMethod === 'requiredExceptLocal' &&
    isLocalClientChain(request.ips ?? [request.ip])

  return {
    isAuthDisabled,
    isLocalBypass,
    shouldBypass: isAuthDisabled || isLocalBypass,
  }
}
