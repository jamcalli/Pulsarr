import { describe, expect, it } from 'vitest'
import { isLocalIpAddress } from '../../../src/utils/ip.js'

describe('ip', () => {
  describe('isLocalIpAddress', () => {
    describe('IPv4 localhost', () => {
      it('should return true for 127.0.0.1', () => {
        expect(isLocalIpAddress('127.0.0.1')).toBe(true)
      })

      it('should return true for 127.x.x.x range', () => {
        expect(isLocalIpAddress('127.0.0.1')).toBe(true)
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
      it('should return false for null/undefined', () => {
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
})
