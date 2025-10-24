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
        const mockRequest = { ip } as unknown as FastifyRequest
        const result = getAuthBypassStatus(mockFastify, mockRequest)

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
        const mockRequest = { ip } as unknown as FastifyRequest
        const result = getAuthBypassStatus(mockFastify, mockRequest)

        expect(result.isLocalBypass).toBe(false)
        expect(result.shouldBypass).toBe(false)
      }
    })
  })
})
