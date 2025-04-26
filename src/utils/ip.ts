/**
 * Check if an IP address is considered "local"
 * Covers all private IP ranges:
 * - 127.0.0.0/8 (localhost)
 * - 10.0.0.0/8
 * - 172.16.0.0/12
 * - 192.168.0.0/16
 * - 169.254.0.0/16 (link-local)
 * - ::1/128 (IPv6 localhost)
 * - fc00::/7 (IPv6 unique local addresses)
 * - fe80::/10 (IPv6 link-local addresses)
 * - ::ffff:x.x.x.x (IPv4-mapped IPv6 addresses)
 */
export function isLocalIpAddress(ip: string): boolean {
  // Trim any whitespace
  const cleanIp = ip.trim()

  // Localhost check
  if (cleanIp === '127.0.0.1' || cleanIp === '::1' || cleanIp === 'localhost') {
    return true
  }

  // IPv4-mapped IPv6 addresses
  if (cleanIp.startsWith('::ffff:')) {
    const ipv4Part = cleanIp.substring(7)
    return isLocalIpAddress(ipv4Part) // Recursively check the IPv4 part
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

  // IPv6 checks with proper format validation
  // Check for ULA (Unique Local Address) fc00::/7
  if (/^fc[0-9a-f]{2}:/i.test(cleanIp) || /^fd[0-9a-f]{2}:/i.test(cleanIp)) {
    return true
  }

  // IPv6 link-local fe80::/10
  if (/^fe80:/i.test(cleanIp)) {
    return true
  }

  return false
}
