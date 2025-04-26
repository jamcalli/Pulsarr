/**
 * Check if an IP address is considered "local"
 * Covers all private IP ranges:
 * - 127.0.0.0/8 (localhost)
 * - 10.0.0.0/8
 * - 172.16.0.0/12
 * - 192.168.0.0/16
 * - ::1/128 (IPv6 localhost)
 * - fc00::/7 (IPv6 unique local addresses)
 * - fe80::/10 (IPv6 link-local addresses)
 */
export function isLocalIpAddress(ip: string): boolean {
  // Localhost check
  if (ip === '127.0.0.1' || ip === '::1' || ip === 'localhost') {
    return true
  }

  // IPv4 private ranges
  if (ip.includes('.')) {
    const parts = ip.split('.').map(Number)

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
  }

  // IPv6 simple checks
  if (ip.startsWith('fc') || ip.startsWith('fd') || ip.startsWith('fe80:')) {
    return true
  }

  return false
}
