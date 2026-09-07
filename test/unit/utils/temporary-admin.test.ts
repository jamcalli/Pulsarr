import { assignTemporaryAdminUser } from '@utils/temporary-admin.js'
import type { FastifyRequest } from 'fastify'
import { beforeEach, describe, expect, it } from 'vitest'

describe('temporary-admin', () => {
  describe('assignTemporaryAdminUser', () => {
    let mockRequest: FastifyRequest

    beforeEach(() => {
      mockRequest = { user: null } as FastifyRequest
    })

    it('should build the identity from the admin user when provided', () => {
      assignTemporaryAdminUser(mockRequest, {
        id: 3,
        username: 'jamcalli',
        email: 'admin@example.com',
        password: 'hashed-password',
        role: 'admin',
      })

      expect(mockRequest.user).toEqual({
        id: 3,
        email: 'admin@example.com',
        username: 'jamcalli',
        role: 'admin',
      })
    })

    it('should not copy the password into the identity', () => {
      assignTemporaryAdminUser(mockRequest, {
        id: 3,
        username: 'jamcalli',
        email: 'admin@example.com',
        password: 'hashed-password',
        role: 'admin',
      })

      expect(mockRequest.user).not.toHaveProperty('password')
    })

    it('should fall back to placeholder identity without an admin user', () => {
      assignTemporaryAdminUser(mockRequest)

      expect(mockRequest.user).toBeDefined()
      expect(mockRequest.user).toEqual({
        id: 1,
        email: 'admin@localhost',
        username: 'Administrator',
        role: 'admin',
      })
    })

    it('should use id 1 in the fallback identity', () => {
      assignTemporaryAdminUser(mockRequest)

      expect(mockRequest.user?.id).toBe(1)
    })

    it('should set fallback role to admin', () => {
      assignTemporaryAdminUser(mockRequest)

      expect(mockRequest.user?.role).toBe('admin')
    })

    it('should set fallback email to admin@localhost', () => {
      assignTemporaryAdminUser(mockRequest)

      expect(mockRequest.user?.email).toBe('admin@localhost')
    })

    it('should set fallback username to Administrator', () => {
      assignTemporaryAdminUser(mockRequest)

      expect(mockRequest.user?.username).toBe('Administrator')
    })

    it('should overwrite an existing user if present', () => {
      mockRequest.user = {
        id: 999,
        email: 'old@example.com',
        username: 'OldUser',
        role: 'user',
      }

      assignTemporaryAdminUser(mockRequest)

      expect(mockRequest.user).toEqual({
        id: 1,
        email: 'admin@localhost',
        username: 'Administrator',
        role: 'admin',
      })
    })

    it('should leave the session untouched', () => {
      const session = {
        user: {
          id: 999,
          email: 'old@example.com',
          username: 'OldUser',
          role: 'user',
        },
      }
      mockRequest = { user: null, session } as FastifyRequest

      assignTemporaryAdminUser(mockRequest)

      expect(mockRequest.session).toBe(session)
      expect(mockRequest.session.user.id).toBe(999)
    })
  })
})
