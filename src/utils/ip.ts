import { splitUrlList } from '@root/schemas/common/url-list.js'
import ipaddr from 'ipaddr.js'

const LOCAL_RANGES = new Set([
  'loopback',
  'private',
  'linkLocal',
  'uniqueLocal',
])

// For bare IPv4 require canonical dotted-quad because ipaddr.js also accepts inet_aton shorthand like '192.168.1'
function isStrictIpAddress(value: string): boolean {
  return value.includes(':')
    ? ipaddr.IPv6.isValid(value)
    : ipaddr.IPv4.isValidFourPartDecimal(value)
}

/** Whether an address is loopback, private or link-local, counting IPv4-mapped IPv6 forms and the name localhost. */
export function isLocalIpAddress(ip: string | undefined): boolean {
  if (!ip) {
    return false
  }

  const cleanIp = ip.trim()

  // request.ip never yields a hostname, but other callers might
  if (cleanIp === 'localhost') {
    return true
  }

  if (!isStrictIpAddress(cleanIp)) {
    return false
  }

  // process() unwraps IPv4-mapped IPv6 (::ffff:a.b.c.d) to plain IPv4
  return LOCAL_RANGES.has(ipaddr.process(cleanIp).range())
}

/** True only when the list is non-empty and every address in it is local or private. */
export function isLocalClientChain(
  addresses: readonly (string | undefined)[],
): boolean {
  return addresses.length > 0 && addresses.every(isLocalIpAddress)
}

function isIPv6NetworkRange(cidr: string): boolean {
  if (!ipaddr.IPv6.isValidCIDR(cidr)) return false
  const [network, prefix] = ipaddr.IPv6.parseCIDR(cidr)
  return (
    prefix > 0 &&
    !network.isIPv4MappedAddress() &&
    ipaddr.IPv6.networkAddressFromCIDR(cidr).toString() === network.toString()
  )
}

function isIPv4NetworkRange(cidr: string): boolean {
  if (!ipaddr.IPv4.isValidCIDR(cidr)) return false
  const [network, prefix] = ipaddr.IPv4.parseCIDR(cidr)
  return (
    prefix > 0 &&
    ipaddr.IPv4.networkAddressFromCIDR(cidr).toString() === network.toString()
  )
}

function isTrustedProxyEntry(entry: string): boolean {
  const [address = '', prefix] = entry.split('/')
  if (!isStrictIpAddress(address)) return false
  if (prefix === undefined) return true
  return address.includes(':')
    ? isIPv6NetworkRange(entry)
    : isIPv4NetworkRange(entry)
}

/** Parses a comma-separated list of IP addresses and CIDR ranges, throwing on any other entry. */
export function parseTrustedProxies(value: string | undefined): string[] {
  return splitUrlList(value).map((entry) => {
    if (!isTrustedProxyEntry(entry)) {
      throw new Error(
        `trustedProxies entry "${entry}" is not an IP address or CIDR range such as 173.245.48.0/20`,
      )
    }
    return entry
  })
}

function toRange(entry: string): [ipaddr.IPv4 | ipaddr.IPv6, number] {
  if (entry.includes('/')) return ipaddr.parseCIDR(entry)
  const address = ipaddr.process(entry)
  return [address, address.kind() === 'ipv4' ? 32 : 128]
}

/** Fastify trustProxy predicate that trusts local and private peers plus the extra addresses and CIDR ranges. */
export function createProxyTrust(
  extra: readonly string[],
): (address: string | undefined) => boolean {
  const ranges = extra.map(toRange)
  return (address) => {
    if (!address || !isStrictIpAddress(address)) return false
    if (isLocalIpAddress(address)) return true
    const ip = ipaddr.process(address)
    return ranges.some(
      ([network, prefix]) =>
        network.kind() === ip.kind() && ip.match(network, prefix),
    )
  }
}

/** Fastify trustProxy predicate that trusts only local peers until configure() supplies the extra ranges, because config loads after the instance exists. */
export function createConfigurableProxyTrust(): {
  trustProxy: (address: string | undefined) => boolean
  configure: (extra: readonly string[]) => void
} {
  let trust = createProxyTrust([])
  return {
    trustProxy: (address) => trust(address),
    configure: (extra) => {
      trust = createProxyTrust(extra)
    },
  }
}
