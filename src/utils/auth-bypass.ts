import { isLocalIpAddress } from '@utils/ip.js'
import type { FastifyInstance, FastifyRequest } from 'fastify'

/**
 * Resolves whether session auth is bypassed for a request: globally
 * (authenticationMethod 'disabled') or because the request comes from a
 * local IP with 'requiredExceptLocal'.
 *
 * @returns A flag per condition plus the combined shouldBypass.
 */
export function getAuthBypassStatus(
  fastify: FastifyInstance,
  request: FastifyRequest,
) {
  const authMethod = fastify.config.authenticationMethod
  const isAuthDisabled = authMethod === 'disabled'
  const isLocalBypass =
    authMethod === 'requiredExceptLocal' && isLocalIpAddress(request.ip)

  return {
    isAuthDisabled,
    isLocalBypass,
    shouldBypass: isAuthDisabled || isLocalBypass,
  }
}
