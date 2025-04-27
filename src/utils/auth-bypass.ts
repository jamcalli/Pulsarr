import { isLocalIpAddress } from '@utils/ip.js'
import type { FastifyInstance, FastifyRequest } from 'fastify'

/**
 * Returns authentication bypass status for a request based on server configuration and the request's IP address.
 *
 * @returns An object with boolean properties: {@link isAuthDisabled} (true if authentication is globally disabled), {@link isLocalBypass} (true if authentication is bypassed for local IPs), and {@link shouldBypass} (true if either condition applies).
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
