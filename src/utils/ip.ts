import ipaddr from 'ipaddr.js'

const LOCAL_RANGES = new Set([
  'loopback',
  'private',
  'linkLocal',
  'uniqueLocal',
])

/**
 * Whether an IP is local or private: localhost, IPv4 private and link-local
 * ranges, IPv6 ULA and link-local, and IPv4-mapped IPv6 forms.
 */
export function isLocalIpAddress(ip: string): boolean {
  if (!ip) {
    return false
  }

  const cleanIp = ip.trim()

  // request.ip never yields a hostname, but other callers might
  if (cleanIp === 'localhost') {
    return true
  }

  // For bare IPv4 require canonical dotted-quad: ipaddr.js also accepts
  // inet_aton shorthand like '192.168.1', which an auth check should reject
  const isValid = cleanIp.includes(':')
    ? ipaddr.IPv6.isValid(cleanIp)
    : ipaddr.IPv4.isValidFourPartDecimal(cleanIp)
  if (!isValid) {
    return false
  }

  // process() unwraps IPv4-mapped IPv6 (::ffff:a.b.c.d) to plain IPv4
  return LOCAL_RANGES.has(ipaddr.process(cleanIp).range())
}
