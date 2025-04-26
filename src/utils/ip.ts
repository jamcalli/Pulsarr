/**
 * Determines whether the given IP address is a local or private address.
 *
 * Checks if the input IP belongs to any recognized local or private ranges, including IPv4 private networks, IPv6 unique local and link-local addresses, localhost, and IPv4-mapped IPv6 addresses.
 *
 * @param ip - The IP address to check.
 * @returns `true` if the IP address is local or private; otherwise, `false`.
 */
export function isLocalIpAddress(ip: string): boolean {
  // Handle null, undefined or empty inputs
  if (!ip) {
    return false
  }

  // Trim any whitespace
  const cleanIp = ip.trim()

  // Handle empty string after trimming
  if (cleanIp.length === 0) {
    return false
  }

  // Localhost check
  if (cleanIp === '127.0.0.1' || cleanIp === '::1' || cleanIp === 'localhost') {
    return true
  }

  // IPv4-mapped IPv6 addresses
  if (cleanIp.startsWith('::ffff:')) {
    const ipv4Part = cleanIp.substring(7)
    // Direct IPv4 check to avoid recursion
    return /^(127\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|192\.168\.|169\.254\.)/.test(
      ipv4Part,
    )
  }

  // IPv4 private ranges
  if (cleanIp.includes('.')) {
    const parts = cleanIp.split('.').map(Number)

    // Validate it's a properly formatted IPv4 address
    if (
      parts.length !== 4 ||
      parts.some((part) => Number.isNaN(part) || part < 0 || part > 255)
    ) {
      return false
    }

    // 10.0.0.0/8
    if (parts[0] === 10) {
      return true
    }

    // 172.16.0.0/12
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) {
      return true
    }

    // 192.168.0.0/16
    if (parts[0] === 192 && parts[1] === 168) {
      return true
    }

    // 169.254.0.0/16 (link-local)
    if (parts[0] === 169 && parts[1] === 254) {
      return true
    }

    // 127.0.0.0/8 (localhost)
    if (parts[0] === 127) {
      return true
    }
  }

  // IPv6 ULA (Unique Local Address) fc00::/7 - check for proper hex format
  const fcFdPattern = /^f[cd][0-9a-f]{2}:([0-9a-f]{0,4}:){0,7}[0-9a-f]{0,4}$/i
  if (fcFdPattern.test(cleanIp)) {
    return true
  }

  // IPv6 link-local fe80::/10 - check for proper hex format
  const fe80Pattern = /^fe80:([0-9a-f]{0,4}:){0,7}[0-9a-f]{0,4}$/i
  if (fe80Pattern.test(cleanIp)) {
    return true
  }

  return false
}
