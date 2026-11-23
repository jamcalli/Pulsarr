import {
  createConfigurableProxyTrust,
  createProxyTrust,
  isLocalClientChain,
  isLocalIpAddress,
  parseTrustedProxies,
} from '@utils/ip.js'
import { describe, expect, it } from 'vitest'

describe('ip', () => {
  describe('isLocalIpAddress', () => {
    describe('IPv4 localhost', () => {
      it('should return true for 127.0.0.1', () => {
        expect(isLocalIpAddress('127.0.0.1')).toBe(true)
      })

      it('should return true for 127.x.x.x range', () => {
        expect(isLocalIpAddress('127.0.0.0')).toBe(true)
        expect(isLocalIpAddress('127.1.1.1')).toBe(true)
        expect(isLocalIpAddress('127.255.255.255')).toBe(true)
      })
    })

    describe('IPv6 localhost', () => {
      it('should return true for ::1', () => {
        expect(isLocalIpAddress('::1')).toBe(true)
      })

      it('should return true for localhost string', () => {
        expect(isLocalIpAddress('localhost')).toBe(true)
      })
    })

    describe('IPv4 private ranges', () => {
      it('should return true for 10.0.0.0/8', () => {
        expect(isLocalIpAddress('10.0.0.1')).toBe(true)
        expect(isLocalIpAddress('10.255.255.255')).toBe(true)
        expect(isLocalIpAddress('10.127.0.1')).toBe(true)
      })

      it('should return true for 172.16.0.0/12', () => {
        expect(isLocalIpAddress('172.16.0.1')).toBe(true)
        expect(isLocalIpAddress('172.31.255.255')).toBe(true)
        expect(isLocalIpAddress('172.20.0.1')).toBe(true)
      })

      it('should return false for 172.x outside private range', () => {
        expect(isLocalIpAddress('172.15.0.1')).toBe(false)
        expect(isLocalIpAddress('172.32.0.1')).toBe(false)
      })

      it('should return true for 192.168.0.0/16', () => {
        expect(isLocalIpAddress('192.168.0.1')).toBe(true)
        expect(isLocalIpAddress('192.168.255.255')).toBe(true)
        expect(isLocalIpAddress('192.168.1.100')).toBe(true)
      })

      it('should return true for 169.254.0.0/16 link-local', () => {
        expect(isLocalIpAddress('169.254.0.1')).toBe(true)
        expect(isLocalIpAddress('169.254.255.255')).toBe(true)
      })
    })

    describe('IPv4 public addresses', () => {
      it('should return false for public IPs', () => {
        expect(isLocalIpAddress('8.8.8.8')).toBe(false)
        expect(isLocalIpAddress('1.1.1.1')).toBe(false)
        expect(isLocalIpAddress('208.67.222.222')).toBe(false)
        expect(isLocalIpAddress('192.0.2.1')).toBe(false)
      })
    })

    describe('IPv6 private ranges', () => {
      it('should return true for fc00::/7 ULA', () => {
        expect(isLocalIpAddress('fc00::1')).toBe(true)
        expect(isLocalIpAddress('fd00::1')).toBe(true)
        expect(
          isLocalIpAddress('fcff:ffff:ffff:ffff:ffff:ffff:ffff:ffff'),
        ).toBe(true)
      })

      it('should return true for fe80::/10 link-local', () => {
        expect(isLocalIpAddress('fe80::1')).toBe(true)
        expect(isLocalIpAddress('fe80:0:0:0:0:0:0:1')).toBe(true)
      })
    })

    describe('IPv4-mapped IPv6 addresses', () => {
      it('should return true for mapped private IPs', () => {
        expect(isLocalIpAddress('::ffff:127.0.0.1')).toBe(true)
        expect(isLocalIpAddress('::ffff:10.0.0.1')).toBe(true)
        expect(isLocalIpAddress('::ffff:192.168.1.1')).toBe(true)
        expect(isLocalIpAddress('::ffff:172.16.0.1')).toBe(true)
      })

      it('should return false for mapped public IPs', () => {
        expect(isLocalIpAddress('::ffff:8.8.8.8')).toBe(false)
        expect(isLocalIpAddress('::ffff:1.1.1.1')).toBe(false)
      })
    })

    describe('invalid inputs', () => {
      it('should return false for empty or whitespace-only strings', () => {
        expect(isLocalIpAddress('')).toBe(false)
        expect(isLocalIpAddress('   ')).toBe(false)
      })

      it('should return false for malformed IPv4', () => {
        expect(isLocalIpAddress('256.1.1.1')).toBe(false)
        expect(isLocalIpAddress('1.1.1')).toBe(false)
        expect(isLocalIpAddress('1.1.1.1.1')).toBe(false)
        expect(isLocalIpAddress('abc.def.ghi.jkl')).toBe(false)
      })

      it('should return false for invalid strings', () => {
        expect(isLocalIpAddress('not-an-ip')).toBe(false)
        expect(isLocalIpAddress('192.168.1')).toBe(false)
      })

      it('should handle whitespace', () => {
        expect(isLocalIpAddress(' 127.0.0.1 ')).toBe(true)
        expect(isLocalIpAddress(' ::1 ')).toBe(true)
      })
    })
  })

  describe('parseTrustedProxies', () => {
    it('returns an empty list for empty or undefined input', () => {
      expect(parseTrustedProxies('')).toEqual([])
      expect(parseTrustedProxies(undefined)).toEqual([])
    })

    it('parses a mixed list of addresses and ranges', () => {
      expect(
        parseTrustedProxies(
          ' 173.245.48.0/20, 203.0.113.7 ,2400:cb00::/32, 2001:db8::1 ',
        ),
      ).toEqual([
        '173.245.48.0/20',
        '203.0.113.7',
        '2400:cb00::/32',
        '2001:db8::1',
      ])
    })

    it.each([
      'proxy.example.com',
      '10.1',
      '10.1/8',
      '10.0.0.0/33',
      '2001:db8::/129',
      'not an ip',
      '0.0.0.0/0',
      '::/0',
      '173.245.48.5/20',
      '10.1.2.3/8',
      '::ffff:173.245.48.0/116',
    ])('rejects %s', (entry) => {
      expect(() => parseTrustedProxies(entry)).toThrow(/trustedProxies/)
    })

    it('accepts a bare IPv4-mapped address', () => {
      expect(parseTrustedProxies('::ffff:173.245.48.5')).toEqual([
        '::ffff:173.245.48.5',
      ])
    })
  })

  describe('createProxyTrust', () => {
    const builtIn = createProxyTrust([])
    const withExtras = createProxyTrust([
      '173.245.48.0/20',
      '2400:cb00::/32',
      '203.0.113.9',
    ])

    it.each([
      '127.0.0.1',
      '::1',
      '10.0.0.5',
      '172.20.0.1',
      '192.168.1.1',
      '169.254.1.1',
      'fd00::1',
      'fe80::1',
      '::ffff:10.0.0.1',
    ])('trusts the local address %s with no extras', (address) => {
      expect(builtIn(address)).toBe(true)
    })

    it.each(['8.8.8.8', '173.245.48.5', '2606:4700::1', 'localhost'])(
      'rejects %s with no extras',
      (address) => {
        expect(builtIn(address)).toBe(false)
      },
    )

    it.each([
      '173.245.48.5',
      '173.245.63.255',
      '2400:cb00::1',
      '203.0.113.9',
      '::ffff:173.245.48.5',
    ])('trusts %s inside an extra entry', (address) => {
      expect(withExtras(address)).toBe(true)
    })

    it.each(['173.245.64.0', '203.0.113.10', 'not an ip', '173.245.48'])(
      'rejects %s outside every extra entry',
      (address) => {
        expect(withExtras(address)).toBe(false)
      },
    )

    it('rejects a missing address from a destroyed socket', () => {
      expect(builtIn(undefined)).toBe(false)
      expect(withExtras(undefined)).toBe(false)
    })
  })

  describe('isLocalClientChain', () => {
    it('rejects an empty chain', () => {
      expect(isLocalClientChain([])).toBe(false)
    })

    it('accepts a chain of local addresses', () => {
      expect(isLocalClientChain(['172.18.0.2', '192.168.1.50', '::1'])).toBe(
        true,
      )
    })

    it('rejects a chain with one public hop', () => {
      expect(
        isLocalClientChain(['172.18.0.2', '173.245.48.5', '10.0.0.1']),
      ).toBe(false)
    })

    it('rejects a chain with a missing address', () => {
      expect(isLocalClientChain(['172.18.0.2', undefined])).toBe(false)
    })
  })

  describe('createConfigurableProxyTrust', () => {
    it('trusts only local peers before configure', () => {
      const { trustProxy } = createConfigurableProxyTrust()

      expect(trustProxy('172.18.0.2')).toBe(true)
      expect(trustProxy('173.245.48.5')).toBe(false)
    })

    it('trusts the extra range after configure', () => {
      const { trustProxy, configure } = createConfigurableProxyTrust()
      configure(['173.245.48.0/20'])

      expect(trustProxy('172.18.0.2')).toBe(true)
      expect(trustProxy('173.245.48.5')).toBe(true)
      expect(trustProxy('203.0.113.7')).toBe(false)
    })
  })
})
