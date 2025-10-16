import type { FastifyRequest } from 'fastify'
import { beforeEach, describe, expect, it } from 'vitest'
import { createTemporaryAdminSession } from '../../../src/utils/session.js'

describe('session', () => {
  describe('createTemporaryAdminSession', () => {
    let mockRequest: FastifyRequest

    beforeEach(() => {
      mockRequest = {
        session: {},
      } as FastifyRequest
    })

    it('should create admin session with required fields', () => {
      createTemporaryAdminSession(mockRequest)

      expect(mockRequest.session.user).toBeDefined()
      expect(mockRequest.session.user).toEqual({
        id: 1,
        email: 'admin@localhost',
        username: 'Administrator',
        role: 'admin',
      })
    })

    it('should always use id 1 for admin user', () => {
      createTemporaryAdminSession(mockRequest)

      expect(mockRequest.session.user?.id).toBe(1)
    })

    it('should set role to admin', () => {
      createTemporaryAdminSession(mockRequest)

      expect(mockRequest.session.user?.role).toBe('admin')
    })

    it('should set email to admin@localhost', () => {
      createTemporaryAdminSession(mockRequest)

      expect(mockRequest.session.user?.email).toBe('admin@localhost')
    })

    it('should set username to Administrator', () => {
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
      mockRequest.session.customProperty = 'preserved'

      createTemporaryAdminSession(mockRequest)

      expect(mockRequest.session.customProperty).toBe('preserved')
      expect(mockRequest.session.user).toBeDefined()
    })
  })
})
