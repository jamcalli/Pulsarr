import type { FastifyReply, FastifyRequest } from 'fastify'
import { describe, expect, it, vi } from 'vitest'
import {
  handleRouteError,
  logRouteError,
  logServiceError,
} from '../../../src/utils/route-errors.js'
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

  describe('logServiceError', () => {
    it('should extract instanceId from route params', () => {
      const mockLogger = createMockLogger()

      const mockRequest = {
        method: 'GET',
        url: '/radarr/tags',
        routeOptions: { url: '/radarr/tags' },
        params: { instanceId: '123' },
        query: {},
      } as unknown as FastifyRequest

      const error = new Error('Test error')

      logServiceError(mockLogger, mockRequest, error, 'radarr')

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          instanceId: '123',
          service: 'radarr',
        }),
        'Error in radarr service operation',
      )
    })

    it('should extract instanceId from query params if not in route params', () => {
      const mockLogger = createMockLogger()

      const mockRequest = {
        method: 'GET',
        url: '/sonarr/series',
        routeOptions: { url: '/sonarr/series' },
        params: {},
        query: { instanceId: '456' },
      } as unknown as FastifyRequest

      const error = new Error('Test error')

      logServiceError(mockLogger, mockRequest, error, 'sonarr')

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          instanceId: '456',
          service: 'sonarr',
        }),
        'Error in sonarr service operation',
      )
    })

    it('should prefer route params over query params for instanceId', () => {
      const mockLogger = createMockLogger()

      const mockRequest = {
        method: 'GET',
        url: '/radarr/movies',
        routeOptions: { url: '/radarr/movies' },
        params: { instanceId: '123' },
        query: { instanceId: '456' },
      } as unknown as FastifyRequest

      const error = new Error('Test error')

      logServiceError(mockLogger, mockRequest, error, 'radarr')

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          instanceId: '123',
        }),
        expect.any(String),
      )
    })

    it('should use custom message when provided', () => {
      const mockLogger = createMockLogger()

      const mockRequest = {
        method: 'GET',
        url: '/tautulli/users',
        routeOptions: { url: '/tautulli/users' },
        params: {},
        query: {},
      } as unknown as FastifyRequest

      const error = new Error('Test error')

      logServiceError(
        mockLogger,
        mockRequest,
        error,
        'tautulli',
        'Failed to fetch users',
      )

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          service: 'tautulli',
        }),
        'Failed to fetch users',
      )
    })

    it('should handle missing instanceId', () => {
      const mockLogger = createMockLogger()

      const mockRequest = {
        method: 'GET',
        url: '/sonarr/health',
        routeOptions: { url: '/sonarr/health' },
        params: {},
        query: {},
      } as unknown as FastifyRequest

      const error = new Error('Test error')

      logServiceError(mockLogger, mockRequest, error, 'sonarr')

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          instanceId: undefined,
          service: 'sonarr',
        }),
        expect.any(String),
      )
    })
  })

  describe('handleRouteError', () => {
    it('should log error and send 500 response', () => {
      const mockLogger = createMockLogger()

      const mockRequest = {
        method: 'POST',
        url: '/api/users',
        routeOptions: { url: '/api/users' },
      } as unknown as FastifyRequest

      const mockReply = {
        status: vi.fn().mockReturnThis(),
        send: vi.fn(),
      } as unknown as FastifyReply

      const error = new Error('Database connection failed')

      handleRouteError(
        mockLogger,
        mockRequest,
        mockReply,
        error,
        'Failed to create user',
      )

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          error,
        }),
        expect.any(String),
      )

      expect(mockReply.status).toHaveBeenCalledWith(500)
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        message: 'Failed to create user',
      })
    })

    it('should use custom log message when provided', () => {
      const mockLogger = createMockLogger()

      const mockRequest = {
        method: 'DELETE',
        url: '/api/items/123',
        routeOptions: { url: '/api/items/:id' },
      } as unknown as FastifyRequest

      const mockReply = {
        status: vi.fn().mockReturnThis(),
        send: vi.fn(),
      } as unknown as FastifyReply

      const error = new Error('Not found')

      handleRouteError(
        mockLogger,
        mockRequest,
        mockReply,
        error,
        'Item not found',
        'Failed to delete item with ID 123',
      )

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.any(Object),
        'Failed to delete item with ID 123',
      )

      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        message: 'Item not found',
      })
    })

    it('should use default log message when not provided', () => {
      const mockLogger = createMockLogger()

      const mockRequest = {
        method: 'GET',
        url: '/api/data',
        routeOptions: { url: '/api/data' },
      } as unknown as FastifyRequest

      const mockReply = {
        status: vi.fn().mockReturnThis(),
        send: vi.fn(),
      } as unknown as FastifyReply

      const error = new Error('Internal error')

      handleRouteError(
        mockLogger,
        mockRequest,
        mockReply,
        error,
        'Something went wrong',
      )

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          error,
          route: 'GET /api/data',
        }),
        'Error in route GET /api/data',
      )
    })
  })
})
