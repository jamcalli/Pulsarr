import { createTemporaryAdminSession } from '@utils/session.js'
import type { FastifyRequest } from 'fastify'
import { beforeEach, describe, expect, it } from 'vitest'

describe('session', () => {
  describe('createTemporaryAdminSession', () => {
    let mockRequest: FastifyRequest

    beforeEach(() => {
      mockRequest = {
        session: {},
      } as FastifyRequest
    })

    it('should build the session from the admin user when provided', () => {
      createTemporaryAdminSession(mockRequest, {
        id: 3,
        username: 'jamcalli',
        email: 'admin@example.com',
        password: 'hashed-password',
        role: 'admin',
      })

      expect(mockRequest.session.user).toEqual({
        id: 3,
        email: 'admin@example.com',
        username: 'jamcalli',
        role: 'admin',
      })
    })

    it('should not copy the password into the session', () => {
      createTemporaryAdminSession(mockRequest, {
        id: 3,
        username: 'jamcalli',
        email: 'admin@example.com',
        password: 'hashed-password',
        role: 'admin',
      })

      expect(mockRequest.session.user).not.toHaveProperty('password')
    })

    it('should fall back to placeholder identity without an admin user', () => {
      createTemporaryAdminSession(mockRequest)

      expect(mockRequest.session.user).toBeDefined()
      expect(mockRequest.session.user).toEqual({
        id: 1,
        email: 'admin@localhost',
        username: 'Administrator',
        role: 'admin',
      })
    })

    it('should use id 1 in the fallback identity', () => {
      createTemporaryAdminSession(mockRequest)

      expect(mockRequest.session.user?.id).toBe(1)
    })

    it('should set fallback role to admin', () => {
      createTemporaryAdminSession(mockRequest)

      expect(mockRequest.session.user?.role).toBe('admin')
    })

    it('should set fallback email to admin@localhost', () => {
      createTemporaryAdminSession(mockRequest)

      expect(mockRequest.session.user?.email).toBe('admin@localhost')
    })

    it('should set fallback username to Administrator', () => {
      createTemporaryAdminSession(mockRequest)

      expect(mockRequest.session.user?.username).toBe('Administrator')
    })

    it('should overwrite existing session user if present', () => {
      mockRequest.session.user = {
        id: 999,
        email: 'old@example.com',
        username: 'OldUser',
        role: 'user',
      }

      createTemporaryAdminSession(mockRequest)

      expect(mockRequest.session.user).toEqual({
        id: 1,
        email: 'admin@localhost',
        username: 'Administrator',
        role: 'admin',
      })
    })

    it('should preserve other session properties', () => {
      ;(
        mockRequest.session as unknown as Record<string, unknown>
      ).customProperty = 'preserved'

      createTemporaryAdminSession(mockRequest)

      expect(
        (mockRequest.session as unknown as Record<string, unknown>)
          .customProperty,
      ).toBe('preserved')
      expect(mockRequest.session.user).toBeDefined()
    })
  })
})
