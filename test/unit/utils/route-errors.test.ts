import { handleArrInstanceError, logRouteError } from '@utils/route-errors.js'
import type { FastifyReply, FastifyRequest } from 'fastify'
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

  describe('handleArrInstanceError', () => {
    function createMockReply() {
      return {
        unauthorized: (msg: string) => ({ status: 401, message: msg }),
        notFound: (msg: string) => ({ status: 404, message: msg }),
        badRequest: (msg: string) => ({ status: 400, message: msg }),
        internalServerError: (msg: string) => ({ status: 500, message: msg }),
      } as unknown as FastifyReply
    }

    it('should return unauthorized for Authentication errors', () => {
      const reply = createMockReply()
      const error = new Error('Authentication failed')
      const result = handleArrInstanceError(error, reply, {
        service: 'radarr',
        defaultMessage: 'Failed',
      })
      expect(result).toEqual({ status: 401, message: 'Authentication failed' })
    })

    it('should return notFound for not found errors', () => {
      const reply = createMockReply()
      const error = new Error('Resource not found')
      const result = handleArrInstanceError(error, reply, {
        service: 'sonarr',
        defaultMessage: 'Failed',
      })
      expect(result).toEqual({ status: 404, message: 'Resource not found' })
    })

    it('should return badRequest for Unable to send test message', () => {
      const reply = createMockReply()
      const error = new Error('Unable to send test message to webhook')
      const result = handleArrInstanceError(error, reply, {
        service: 'radarr',
        defaultMessage: 'Failed',
      })
      expect(result).toEqual({
        status: 400,
        message: 'Unable to send test message to webhook',
      })
    })

    it('should return badRequest for Unable to post to webhook', () => {
      const reply = createMockReply()
      const error = new Error('Unable to post to webhook')
      const result = handleArrInstanceError(error, reply, {
        service: 'radarr',
        defaultMessage: 'Failed',
      })
      expect(result).toEqual({
        status: 400,
        message: 'Unable to post to webhook',
      })
    })

    it('should return badRequest for Connection refused errors', () => {
      const reply = createMockReply()
      const error = new Error('Connection refused')
      const result = handleArrInstanceError(error, reply, {
        service: 'sonarr',
        defaultMessage: 'Failed',
      })
      expect(result).toEqual({ status: 400, message: 'Connection refused' })
    })

    it('should return badRequest for Name does not resolve errors', () => {
      const reply = createMockReply()
      const error = new Error('Name does not resolve')
      const result = handleArrInstanceError(error, reply, {
        service: 'radarr',
        defaultMessage: 'Failed',
      })
      expect(result).toEqual({ status: 400, message: 'Name does not resolve' })
    })

    it('should return badRequest for Cannot remove default errors', () => {
      const reply = createMockReply()
      const error = new Error(
        'Cannot remove default status from active instance',
      )
      const result = handleArrInstanceError(error, reply, {
        service: 'radarr',
        defaultMessage: 'Failed',
      })
      expect(result).toEqual({
        status: 400,
        message: 'Cannot remove default status from active instance',
      })
    })

    it('should strip Radarr API error prefix from message', () => {
      const reply = createMockReply()
      const error = new Error('Radarr API error: Authentication failed')
      const result = handleArrInstanceError(error, reply, {
        service: 'radarr',
        defaultMessage: 'Failed',
      })
      expect(result).toEqual({
        status: 401,
        message: 'Authentication failed',
      })
    })

    it('should strip Sonarr API error prefix from message', () => {
      const reply = createMockReply()
      const error = new Error('Sonarr API error: Resource not found')
      const result = handleArrInstanceError(error, reply, {
        service: 'sonarr',
        defaultMessage: 'Failed',
      })
      expect(result).toEqual({ status: 404, message: 'Resource not found' })
    })

    it('should replace init failure prefix with user-friendly message', () => {
      const reply = createMockReply()
      const error = new Error(
        'Failed to initialize Radarr instance: Connection refused',
      )
      const result = handleArrInstanceError(error, reply, {
        service: 'radarr',
        defaultMessage: 'Failed',
      })
      expect(result).toEqual({
        status: 400,
        message: 'Failed to save settings: Connection refused',
      })
    })

    it('should return internalServerError for generic Error', () => {
      const reply = createMockReply()
      const error = new Error('Something unexpected happened')
      const result = handleArrInstanceError(error, reply, {
        service: 'radarr',
        defaultMessage: 'Failed',
      })
      expect(result).toEqual({
        status: 500,
        message: 'Something unexpected happened',
      })
    })

    it('should return internalServerError with defaultMessage for non-Error', () => {
      const reply = createMockReply()
      const result = handleArrInstanceError('string error', reply, {
        service: 'radarr',
        defaultMessage: 'Default failure message',
      })
      expect(result).toEqual({
        status: 500,
        message: 'Default failure message',
      })
    })

    it('should return internalServerError with defaultMessage for null error', () => {
      const reply = createMockReply()
      const result = handleArrInstanceError(null, reply, {
        service: 'sonarr',
        defaultMessage: 'Operation failed',
      })
      expect(result).toEqual({ status: 500, message: 'Operation failed' })
    })
  })
})
