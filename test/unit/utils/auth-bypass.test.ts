import { getAuthBypassStatus } from '@utils/auth-bypass.js'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { describe, expect, it } from 'vitest'

describe('auth-bypass', () => {
  describe('getAuthBypassStatus', () => {
    it('should bypass when auth is disabled', () => {
      const mockFastify = {
        config: {
          authenticationMethod: 'disabled' as const,
        },
      } as unknown as FastifyInstance

      const mockRequest = {
        ip: '8.8.8.8',
        headers: {},
      } as unknown as FastifyRequest

      const result = getAuthBypassStatus(mockFastify, mockRequest)

      expect(result.isAuthDisabled).toBe(true)
      expect(result.isLocalBypass).toBe(false)
      expect(result.shouldBypass).toBe(true)
    })

    it('should bypass for local IP when requiredExceptLocal', () => {
      const mockFastify = {
        config: {
          authenticationMethod: 'requiredExceptLocal',
        },
      } as unknown as FastifyInstance

      const mockRequest = {
        ip: '127.0.0.1',
        headers: {},
      } as unknown as FastifyRequest

      const result = getAuthBypassStatus(mockFastify, mockRequest)

      expect(result.isAuthDisabled).toBe(false)
      expect(result.isLocalBypass).toBe(true)
      expect(result.shouldBypass).toBe(true)
    })

    it('should not bypass for public IP when requiredExceptLocal', () => {
      const mockFastify = {
        config: {
          authenticationMethod: 'requiredExceptLocal',
        },
      } as unknown as FastifyInstance

      const mockRequest = {
        ip: '8.8.8.8',
        headers: {},
      } as unknown as FastifyRequest

      const result = getAuthBypassStatus(mockFastify, mockRequest)

      expect(result.isAuthDisabled).toBe(false)
      expect(result.isLocalBypass).toBe(false)
      expect(result.shouldBypass).toBe(false)
    })

    it('should not bypass when auth is required', () => {
      const mockFastify = {
        config: {
          authenticationMethod: 'required',
        },
      } as unknown as FastifyInstance

      const mockRequest = {
        ip: '127.0.0.1', // even local IP shouldn't bypass
        headers: {},
      } as unknown as FastifyRequest

      const result = getAuthBypassStatus(mockFastify, mockRequest)

      expect(result.isAuthDisabled).toBe(false)
      expect(result.isLocalBypass).toBe(false)
      expect(result.shouldBypass).toBe(false)
    })

    it('should handle private network IPs with requiredExceptLocal', () => {
      const mockFastify = {
        config: {
          authenticationMethod: 'requiredExceptLocal',
        },
      } as unknown as FastifyInstance

      const privateIps = [
        '10.0.0.1',
        '192.168.1.1',
        '172.16.0.1',
        '::1',
        'fe80::1',
      ]

      for (const ip of privateIps) {
        const mockRequest = { ip, headers: {} } as unknown as FastifyRequest
        const result = getAuthBypassStatus(mockFastify, mockRequest)

        expect(result.isAuthDisabled).toBe(false)
        expect(result.isLocalBypass).toBe(true)
        expect(result.shouldBypass).toBe(true)
      }
    })

    it('should not bypass public IPs with requiredExceptLocal', () => {
      const mockFastify = {
        config: {
          authenticationMethod: 'requiredExceptLocal',
        },
      } as unknown as FastifyInstance

      const publicIps = ['8.8.8.8', '1.1.1.1', '208.67.222.222']

      for (const ip of publicIps) {
        const mockRequest = { ip, headers: {} } as unknown as FastifyRequest
        const result = getAuthBypassStatus(mockFastify, mockRequest)

        expect(result.isAuthDisabled).toBe(false)
        expect(result.isLocalBypass).toBe(false)
        expect(result.shouldBypass).toBe(false)
      }
    })

    it('keeps the local rule for a client resolved through a trusted proxy', () => {
      const mockFastify = {
        config: { authenticationMethod: 'requiredExceptLocal' },
      } as unknown as FastifyInstance

      const mockRequest = {
        ip: '192.168.1.50',
        ips: ['10.0.0.2', '192.168.1.50'],
        headers: { 'x-forwarded-for': '192.168.1.50' },
      } as unknown as FastifyRequest

      expect(getAuthBypassStatus(mockFastify, mockRequest).isLocalBypass).toBe(
        true,
      )
    })

    it('keeps the local rule when a local proxy sends an empty x-forwarded-for', () => {
      const mockFastify = {
        config: { authenticationMethod: 'requiredExceptLocal' },
      } as unknown as FastifyInstance

      const mockRequest = {
        ip: '192.168.1.5',
        ips: ['192.168.1.5'],
        headers: { 'x-forwarded-for': ' ' },
      } as unknown as FastifyRequest

      const result = getAuthBypassStatus(mockFastify, mockRequest)

      expect(result.isLocalBypass).toBe(true)
    })

    it('drops the local rule when an untrusted peer sends x-forwarded-for', () => {
      const mockFastify = {
        config: { authenticationMethod: 'requiredExceptLocal' },
      } as unknown as FastifyInstance

      const mockRequest = {
        ip: '192.168.1.50',
        ips: ['192.168.1.50'],
        headers: { 'x-forwarded-for': '10.0.0.9' },
      } as unknown as FastifyRequest

      const result = getAuthBypassStatus(mockFastify, mockRequest)

      expect(result.isLocalBypass).toBe(false)
      expect(result.shouldBypass).toBe(false)
    })

    it('drops the local rule for x-forwarded-for when trustProxy is off', () => {
      const mockFastify = {
        config: { authenticationMethod: 'requiredExceptLocal' },
      } as unknown as FastifyInstance

      const mockRequest = {
        ip: '127.0.0.1',
        headers: { 'x-forwarded-for': '127.0.0.1' },
      } as unknown as FastifyRequest

      expect(getAuthBypassStatus(mockFastify, mockRequest).isLocalBypass).toBe(
        false,
      )
    })

    it('still bypasses forwarded requests when auth is disabled', () => {
      const mockFastify = {
        config: { authenticationMethod: 'disabled' },
      } as unknown as FastifyInstance

      const mockRequest = {
        ip: '8.8.8.8',
        ips: ['8.8.8.8'],
        headers: { 'x-forwarded-for': '10.0.0.9' },
      } as unknown as FastifyRequest

      expect(getAuthBypassStatus(mockFastify, mockRequest).shouldBypass).toBe(
        true,
      )
    })
  })
})
