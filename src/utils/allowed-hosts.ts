import { hostname } from 'node:os'
import { splitUrlList } from '@root/schemas/common/url-list.js'
import ipaddr from 'ipaddr.js'

const ALWAYS_ALLOWED_HOSTS = ['localhost', '127.0.0.1', '::1']

// URL hosts bracket IPv6 and ipaddr.js does not, so brackets come off before parsing
function normalizeHost(value: string): string {
  const host = value.replace(/^\[(.*)\]$/, '$1').toLowerCase()
  return ipaddr.IPv6.isValid(host) ? ipaddr.process(host).toString() : host
}

function isHostname(value: string): boolean {
  if (ipaddr.IPv6.isValid(value)) return true
  return (
    URL.canParse(`http://${value}`) &&
    new URL(`http://${value}`).hostname === value
  )
}

/** Parses a comma-separated hostname list into lowercase hostnames, throwing on an entry with a scheme, port or path. */
export function parseAllowedHosts(value: string | undefined): string[] {
  return splitUrlList(value).map((entry) => {
    const host = normalizeHost(entry)
    if (!isHostname(host)) {
      throw new Error(
        `allowedHosts entry "${entry}" is not a hostname such as pulsarr.example.com`,
      )
    }
    return host
  })
}

/** Builds the accepted host set: the configured hostnames plus loopback names and this machine's hostname. */
export function buildAllowedHostSet(
  configured: readonly string[],
): ReadonlySet<string> {
  return new Set([
    ...configured,
    ...ALWAYS_ALLOWED_HOSTS,
    hostname().toLowerCase(),
  ])
}

/** Whether a request hostname (as Fastify parses it, IPv6 in brackets) is accepted. An empty hostname passes. */
export function isAllowedHost(
  requestHostname: string,
  allowed: ReadonlySet<string>,
): boolean {
  if (!requestHostname) return true
  return allowed.has(normalizeHost(requestHostname))
}
