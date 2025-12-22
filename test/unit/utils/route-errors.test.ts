import { logRouteError } from '@utils/route-errors.js'
import type { FastifyRequest } from 'fastify'
import { describe, expect, it } from 'vitest'
import { createMockLogger } from '../../mocks/logger.js'

describe('route-errors', () => {
  describe('logRouteError', () => {
    it('should log error with default message and route', () => {
      const mockLogger = createMockLogger()

      const mockRequest = {
        method: 'GET',
        url: '/api/test',
        routeOptions: { url: '/api/test' },
      } as unknown as FastifyRequest

      const error = new Error('Test error')

      logRouteError(mockLogger, mockRequest, error)

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          error,
          route: 'GET /api/test',
        }),
        'Error in route GET /api/test',
      )
    })

    it('should use custom message when provided', () => {
      const mockLogger = createMockLogger()

      const mockRequest = {
        method: 'POST',
        url: '/api/users',
        routeOptions: { url: '/api/users' },
      } as unknown as FastifyRequest

      const error = new Error('Test error')

      logRouteError(mockLogger, mockRequest, error, {
        message: 'Failed to create user',
      })

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          error,
          route: 'POST /api/users',
        }),
        'Failed to create user',
      )
    })

    it('should include userId when authenticated user exists', () => {
      const mockLogger = createMockLogger()

      const mockRequest = {
        method: 'GET',
        url: '/api/test',
        routeOptions: { url: '/api/test' },
        user: { id: 123 },
      } as unknown as FastifyRequest

      const error = new Error('Test error')

      logRouteError(mockLogger, mockRequest, error)

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 123,
        }),
        expect.any(String),
      )
    })

    it('should handle user without id', () => {
      const mockLogger = createMockLogger()

      const mockRequest = {
        method: 'GET',
        url: '/api/test',
        routeOptions: { url: '/api/test' },
        user: { name: 'test' },
      } as unknown as FastifyRequest

      const error = new Error('Test error')

      logRouteError(mockLogger, mockRequest, error)

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.not.objectContaining({
          userId: expect.anything(),
        }),
        expect.any(String),
      )
    })

    it('should include additional context when provided', () => {
      const mockLogger = createMockLogger()

      const mockRequest = {
        method: 'GET',
        url: '/api/test',
        routeOptions: { url: '/api/test' },
      } as unknown as FastifyRequest

      const error = new Error('Test error')

      logRouteError(mockLogger, mockRequest, error, {
        context: {
          instanceId: '456',
          tagName: 'test-tag',
        },
      })

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          instanceId: '456',
          tagName: 'test-tag',
        }),
        expect.any(String),
      )
    })

    it('should include direct context fields from options', () => {
      const mockLogger = createMockLogger()

      const mockRequest = {
        method: 'GET',
        url: '/api/test',
        routeOptions: { url: '/api/test' },
      } as unknown as FastifyRequest

      const error = new Error('Test error')

      logRouteError(mockLogger, mockRequest, error, {
        instanceId: '789',
        customField: 'value',
      })

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          instanceId: '789',
          customField: 'value',
        }),
        expect.any(String),
      )
    })

    it('should use warn level when specified', () => {
      const mockLogger = createMockLogger()

      const mockRequest = {
        method: 'GET',
        url: '/api/test',
        routeOptions: { url: '/api/test' },
      } as unknown as FastifyRequest

      const error = new Error('Test error')

      logRouteError(mockLogger, mockRequest, error, {
        level: 'warn',
      })

      expect(mockLogger.warn).toHaveBeenCalledTimes(1)
      expect(mockLogger.error).not.toHaveBeenCalled()
      expect(mockLogger.info).not.toHaveBeenCalled()
    })

    it('should use info level when specified', () => {
      const mockLogger = createMockLogger()

      const mockRequest = {
        method: 'GET',
        url: '/api/test',
        routeOptions: { url: '/api/test' },
      } as unknown as FastifyRequest

      const error = new Error('Test error')

      logRouteError(mockLogger, mockRequest, error, {
        level: 'info',
      })

      expect(mockLogger.info).toHaveBeenCalledTimes(1)
      expect(mockLogger.error).not.toHaveBeenCalled()
      expect(mockLogger.warn).not.toHaveBeenCalled()
    })

    it('should fall back to request.url when routeOptions is missing', () => {
      const mockLogger = createMockLogger()

      const mockRequest = {
        method: 'GET',
        url: '/api/fallback',
      } as unknown as FastifyRequest

      const error = new Error('Test error')

      logRouteError(mockLogger, mockRequest, error)

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          route: 'GET /api/fallback',
        }),
        expect.any(String),
      )
    })
  })
})
