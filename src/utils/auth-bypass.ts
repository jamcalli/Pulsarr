import { isLocalIpAddress } from '@utils/ip.js'
import type { FastifyInstance, FastifyRequest } from 'fastify'

/**
 * Determines if authentication should be bypassed based on configuration and request IP.
 *
 * @param fastify - The Fastify instance containing configuration
 * @param request - The request object with IP information
 * @returns Authentication bypass status details
 */
export function getAuthBypassStatus(
  fastify: FastifyInstance,
  request: FastifyRequest,
) {
  const authMethod = fastify.config.authenticationMethod as
    | 'disabled'
    | 'requiredExceptLocal'
    | 'required'
  const isAuthDisabled = authMethod === 'disabled'
  const isLocalBypass =
    authMethod === 'requiredExceptLocal' && isLocalIpAddress(request.ip)

  return {
    isAuthDisabled,
    isLocalBypass,
    shouldBypass: isAuthDisabled || isLocalBypass,
  }
}
