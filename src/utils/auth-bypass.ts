import { isLocalIpAddress } from '@utils/ip.js'
import type { FastifyInstance, FastifyRequest } from 'fastify'

// request.ips holds the socket address plus each forwarded hop Fastify accepted from a trusted proxy
function isForwardedByUntrustedPeer(request: FastifyRequest): boolean {
  return (
    String(request.headers['x-forwarded-for'] ?? '').trim() !== '' &&
    (request.ips?.length ?? 0) < 2
  )
}

/** Whether session auth is bypassed globally ('disabled') or for a local client under 'requiredExceptLocal', never for a request forwarded by an untrusted peer. */
export function getAuthBypassStatus(
  fastify: FastifyInstance,
  request: FastifyRequest,
) {
  const authMethod = fastify.config.authenticationMethod
  const isAuthDisabled = authMethod === 'disabled'
  const isLocalBypass =
    authMethod === 'requiredExceptLocal' &&
    !isForwardedByUntrustedPeer(request) &&
    isLocalIpAddress(request.ip)

  return {
    isAuthDisabled,
    isLocalBypass,
    shouldBypass: isAuthDisabled || isLocalBypass,
  }
}
