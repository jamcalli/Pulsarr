import type { FastifyRequest } from 'fastify'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockLogger } from '../../mocks/logger.js'

// Mock dependencies before importing the module
vi.mock('dotenv', () => ({
  config: vi.fn(),
}))

vi.mock('rotating-file-stream', () => ({
  createStream: vi.fn(() => ({
    write: vi.fn(),
    end: vi.fn(),
  })),
}))

vi.mock('pino-pretty', () => ({
  default: vi.fn((options) => ({
    write: vi.fn(),
    end: vi.fn(),
    options,
  })),
}))

vi.mock('pino', async () => {
  const actual = await vi.importActual<typeof import('pino')>('pino')
  return {
    ...actual,
    multistream: vi.fn((streams) => ({
      streams,
      write: vi.fn(),
    })),
  }
})

// Type for testing internal serializers
type LoggerConfigWithSerializers = {
  serializers?: {
    error?: (err: unknown) => Record<string, unknown>
    req?: (req: FastifyRequest) => Record<string, unknown>
  }
}

// Now import the module after mocks are set up
const { createServiceLogger, validLogLevels } = await import('@utils/logger.js')

describe('logger', () => {
  describe('validLogLevels', () => {
    it('should export all valid pino log levels', () => {
      expect(validLogLevels).toEqual([
        'fatal',
        'error',
        'warn',
        'info',
        'debug',
        'trace',
        'silent',
      ])
    })

    it('should be an array of 7 log levels', () => {
      expect(validLogLevels).toHaveLength(7)
    })
  })

  describe('createServiceLogger', () => {
    it('should create a child logger with uppercased service prefix', () => {
      const mockParentLogger = createMockLogger()
      const childLogger = createServiceLogger(mockParentLogger, 'webhook')

      expect(mockParentLogger.child).toHaveBeenCalledWith(
        {},
        { msgPrefix: '[WEBHOOK] ' },
      )
      expect(childLogger).toBeDefined()
    })

    it('should uppercase mixed-case service names', () => {
      const mockParentLogger = createMockLogger()
      createServiceLogger(mockParentLogger, 'WebHook')

      expect(mockParentLogger.child).toHaveBeenCalledWith(
        {},
        { msgPrefix: '[WEBHOOK] ' },
      )
    })

    it('should handle lowercase service names', () => {
      const mockParentLogger = createMockLogger()
      createServiceLogger(mockParentLogger, 'approval')

      expect(mockParentLogger.child).toHaveBeenCalledWith(
        {},
        { msgPrefix: '[APPROVAL] ' },
      )
    })

    it('should handle uppercase service names', () => {
      const mockParentLogger = createMockLogger()
      createServiceLogger(mockParentLogger, 'SONARR')

      expect(mockParentLogger.child).toHaveBeenCalledWith(
        {},
        { msgPrefix: '[SONARR] ' },
      )
    })

    it('should create functional child logger that can log', () => {
      const mockParentLogger = createMockLogger()
      const childLogger = createServiceLogger(mockParentLogger, 'test')

      childLogger.info('test message')

      expect(childLogger.info).toHaveBeenCalledWith('test message')
    })
  })

  describe('error serializer', () => {
    // We need to test the serializer indirectly through logger config
    // since it's not exported. We'll import it differently for testing.

    beforeEach(() => {
      vi.clearAllMocks()
    })

    describe('primitive value handling', () => {
      it('should serialize string errors', async () => {
        // Import the internal function for testing
        const module = await import('@utils/logger.js')
        // Access through the module's closure
        const loggerConfig = module.createLoggerConfig()
        const serializer = (loggerConfig as LoggerConfigWithSerializers)
          .serializers?.error

        if (serializer) {
          const result = serializer('string error')
          expect(result).toEqual({
            message: 'string error',
            type: 'StringError',
          })
        }
      })

      it('should serialize number errors', async () => {
        const module = await import('@utils/logger.js')
        const loggerConfig = module.createLoggerConfig()
        const serializer = (loggerConfig as LoggerConfigWithSerializers)
          .serializers?.error

        if (serializer) {
          const result = serializer(404)
          expect(result).toEqual({
            message: '404',
            type: 'NumberError',
          })
        }
      })

      it('should serialize boolean errors', async () => {
        const module = await import('@utils/logger.js')
        const loggerConfig = module.createLoggerConfig()
        const serializer = (loggerConfig as LoggerConfigWithSerializers)
          .serializers?.error

        if (serializer) {
          const result = serializer(false)
          expect(result).toEqual({
            message: 'false',
            type: 'BooleanError',
          })
        }
      })

      it('should handle null and undefined', async () => {
        const module = await import('@utils/logger.js')
        const loggerConfig = module.createLoggerConfig()
        const serializer = (loggerConfig as LoggerConfigWithSerializers)
          .serializers?.error

        if (serializer) {
          expect(serializer(null)).toBeNull()
          expect(serializer(undefined)).toBeUndefined()
        }
      })
    })

    describe('Error instance handling', () => {
      it('should serialize standard Error with type', async () => {
        const module = await import('@utils/logger.js')
        const loggerConfig = module.createLoggerConfig()
        const serializer = (loggerConfig as LoggerConfigWithSerializers)
          .serializers?.error

        if (serializer) {
          const error = new Error('Test error')
          const result = serializer(error)

          expect(result).toMatchObject({
            message: 'Test error',
            name: 'Error',
            type: 'Error',
          })
          expect(result.stack).toBeDefined()
        }
      })

      it('should serialize TypeError with correct type', async () => {
        const module = await import('@utils/logger.js')
        const loggerConfig = module.createLoggerConfig()
        const serializer = (loggerConfig as LoggerConfigWithSerializers)
          .serializers?.error

        if (serializer) {
          const error = new TypeError('Type error')
          const result = serializer(error)

          expect(result).toMatchObject({
            message: 'Type error',
            name: 'TypeError',
            type: 'TypeError',
          })
        }
      })

      it('should serialize ReferenceError with correct type', async () => {
        const module = await import('@utils/logger.js')
        const loggerConfig = module.createLoggerConfig()
        const serializer = (loggerConfig as LoggerConfigWithSerializers)
          .serializers?.error

        if (serializer) {
          const error = new ReferenceError('Reference error')
          const result = serializer(error)

          expect(result).toMatchObject({
            message: 'Reference error',
            type: 'ReferenceError',
          })
        }
      })

      it('should serialize SyntaxError with correct type', async () => {
        const module = await import('@utils/logger.js')
        const loggerConfig = module.createLoggerConfig()
        const serializer = (loggerConfig as LoggerConfigWithSerializers)
          .serializers?.error

        if (serializer) {
          const error = new SyntaxError('Syntax error')
          const result = serializer(error)

          expect(result).toMatchObject({
            message: 'Syntax error',
            type: 'SyntaxError',
          })
        }
      })

      it('should serialize RangeError with correct type', async () => {
        const module = await import('@utils/logger.js')
        const loggerConfig = module.createLoggerConfig()
        const serializer = (loggerConfig as LoggerConfigWithSerializers)
          .serializers?.error

        if (serializer) {
          const error = new RangeError('Range error')
          const result = serializer(error)

          expect(result).toMatchObject({
            message: 'Range error',
            type: 'RangeError',
          })
        }
      })

      it('should serialize AggregateError with correct type', async () => {
        const module = await import('@utils/logger.js')
        const loggerConfig = module.createLoggerConfig()
        const serializer = (loggerConfig as LoggerConfigWithSerializers)
          .serializers?.error

        if (serializer) {
          const error = new AggregateError(
            [new Error('inner')],
            'Aggregate error',
          )
          const result = serializer(error)

          expect(result).toMatchObject({
            message: 'Aggregate error',
            type: 'AggregateError',
          })
        }
      })
    })

    describe('HTTP error handling', () => {
      it('should include statusCode for HTTP errors', async () => {
        const module = await import('@utils/logger.js')
        const loggerConfig = module.createLoggerConfig()
        const serializer = (loggerConfig as LoggerConfigWithSerializers)
          .serializers?.error

        if (serializer) {
          const httpError = Object.assign(new Error('Not found'), {
            statusCode: 404,
          })
          const result = serializer(httpError)

          expect(result).toMatchObject({
            message: 'Not found',
            statusCode: 404,
          })
        }
      })

      it('should include status for HTTP errors', async () => {
        const module = await import('@utils/logger.js')
        const loggerConfig = module.createLoggerConfig()
        const serializer = (loggerConfig as LoggerConfigWithSerializers)
          .serializers?.error

        if (serializer) {
          const httpError = Object.assign(new Error('Bad request'), {
            status: 400,
          })
          const result = serializer(httpError)

          expect(result).toMatchObject({
            message: 'Bad request',
            status: 400,
          })
        }
      })

      it('should exclude stack for 4xx client errors', async () => {
        const module = await import('@utils/logger.js')
        const loggerConfig = module.createLoggerConfig()
        const serializer = (loggerConfig as LoggerConfigWithSerializers)
          .serializers?.error

        if (serializer) {
          const clientError = Object.assign(new Error('Bad request'), {
            statusCode: 400,
          })
          const result = serializer(clientError)

          expect(result.stack).toBeUndefined()
        }
      })

      it('should include stack for 5xx server errors', async () => {
        const module = await import('@utils/logger.js')
        const loggerConfig = module.createLoggerConfig()
        const serializer = (loggerConfig as LoggerConfigWithSerializers)
          .serializers?.error

        if (serializer) {
          const serverError = Object.assign(new Error('Internal error'), {
            statusCode: 500,
          })
          const result = serializer(serverError)

          expect(result.stack).toBeDefined()
        }
      })

      it('should include stack for errors without status code', async () => {
        const module = await import('@utils/logger.js')
        const loggerConfig = module.createLoggerConfig()
        const serializer = (loggerConfig as LoggerConfigWithSerializers)
          .serializers?.error

        if (serializer) {
          const error = new Error('Generic error')
          const result = serializer(error)

          expect(result.stack).toBeDefined()
        }
      })
    })

    describe('error cause handling', () => {
      it('should recursively serialize error cause', async () => {
        const module = await import('@utils/logger.js')
        const loggerConfig = module.createLoggerConfig()
        const serializer = (loggerConfig as LoggerConfigWithSerializers)
          .serializers?.error

        if (serializer) {
          const innerError = new Error('Inner error')
          const outerError = new Error('Outer error', { cause: innerError })
          const result = serializer(outerError)

          expect(result.cause).toMatchObject({
            message: 'Inner error',
            type: 'Error',
          })
        }
      })

      it('should handle nested error causes', async () => {
        const module = await import('@utils/logger.js')
        const loggerConfig = module.createLoggerConfig()
        const serializer = (loggerConfig as LoggerConfigWithSerializers)
          .serializers?.error

        if (serializer) {
          const deepError = new Error('Deep error')
          const middleError = new Error('Middle error', { cause: deepError })
          const topError = new Error('Top error', { cause: middleError })
          const result = serializer(topError)

          expect(result.cause).toMatchObject({
            message: 'Middle error',
          })
          expect((result.cause as Record<string, unknown>).cause).toMatchObject(
            {
              message: 'Deep error',
            },
          )
        }
      })

      it('should handle primitive cause values', async () => {
        const module = await import('@utils/logger.js')
        const loggerConfig = module.createLoggerConfig()
        const serializer = (loggerConfig as LoggerConfigWithSerializers)
          .serializers?.error

        if (serializer) {
          const error = new Error('Error with string cause', {
            cause: 'string cause',
          })
          const result = serializer(error)

          expect(result.cause).toMatchObject({
            message: 'string cause',
            type: 'StringError',
          })
        }
      })
    })

    describe('custom error properties', () => {
      it('should include custom enumerable properties', async () => {
        const module = await import('@utils/logger.js')
        const loggerConfig = module.createLoggerConfig()
        const serializer = (loggerConfig as LoggerConfigWithSerializers)
          .serializers?.error

        if (serializer) {
          const customError = Object.assign(new Error('Custom error'), {
            customProp: 'custom value',
            requestId: '12345',
          })
          const result = serializer(customError)

          expect(result).toMatchObject({
            message: 'Custom error',
            customProp: 'custom value',
            requestId: '12345',
          })
        }
      })

      it('should not duplicate standard properties', async () => {
        const module = await import('@utils/logger.js')
        const loggerConfig = module.createLoggerConfig()
        const serializer = (loggerConfig as LoggerConfigWithSerializers)
          .serializers?.error

        if (serializer) {
          const error = new Error('Test')
          const result = serializer(error)
          const keys = Object.keys(result)

          // Should not have duplicate 'message', 'name', etc.
          const messageCount = keys.filter((k) => k === 'message').length
          expect(messageCount).toBe(1)
        }
      })

      it('should handle plain object errors', async () => {
        const module = await import('@utils/logger.js')
        const loggerConfig = module.createLoggerConfig()
        const serializer = (loggerConfig as LoggerConfigWithSerializers)
          .serializers?.error

        if (serializer) {
          const plainError = {
            message: 'Plain object error',
            name: 'CustomError',
            customField: 'value',
          }
          const result = serializer(plainError)

          expect(result).toMatchObject({
            message: 'Plain object error',
            name: 'CustomError',
            type: 'CustomError',
            customField: 'value',
          })
        }
      })

      it('should handle errors without name as UnknownError', async () => {
        const module = await import('@utils/logger.js')
        const loggerConfig = module.createLoggerConfig()
        const serializer = (loggerConfig as LoggerConfigWithSerializers)
          .serializers?.error

        if (serializer) {
          const unknownError = { message: 'Unknown' }
          const result = serializer(unknownError)

          expect(result).toMatchObject({
            message: 'Unknown',
            type: 'UnknownError',
          })
        }
      })
    })
  })

  describe('createLoggerConfig', () => {
    beforeEach(() => {
      vi.clearAllMocks()
      delete process.env.enableConsoleOutput
    })

    afterEach(() => {
      delete process.env.enableConsoleOutput
    })

    it('should return file-only config when enableConsoleOutput is false', async () => {
      process.env.enableConsoleOutput = 'false'
      const module = await import('@utils/logger.js')
      const config = module.createLoggerConfig()

      // File-only config should have a stream (from getFileOptions)
      expect(config).toHaveProperty('level', 'info')
      expect(config).toHaveProperty('stream')
      expect(config).toHaveProperty('serializers')
    })

    it('should return config with serializers when console output is enabled', async () => {
      const module = await import('@utils/logger.js')
      const config = module.createLoggerConfig()

      expect(config).toHaveProperty('level', 'info')
      expect(config).toHaveProperty('serializers')
      const serializers = (config as LoggerConfigWithSerializers).serializers
      expect(serializers?.error).toBeTypeOf('function')
      expect(serializers?.req).toBeTypeOf('function')
    })
  })

  describe('request serializer', () => {
    it('should serialize basic request information', async () => {
      const module = await import('@utils/logger.js')
      const loggerConfig = module.createLoggerConfig()
      const serializer = (loggerConfig as LoggerConfigWithSerializers)
        .serializers?.req

      if (serializer) {
        const mockRequest = {
          method: 'GET',
          url: '/api/test',
          headers: { host: 'localhost:3000' },
          ip: '127.0.0.1',
          socket: { remotePort: 54321 },
        } as unknown as FastifyRequest

        const result = serializer(mockRequest)

        expect(result).toMatchObject({
          method: 'GET',
          url: '/api/test',
          host: 'localhost:3000',
          remoteAddress: '127.0.0.1',
          remotePort: 54321,
        })
      }
    })

    describe('sensitive parameter redaction', () => {
      it('should redact apiKey query parameter', async () => {
        const module = await import('@utils/logger.js')
        const loggerConfig = module.createLoggerConfig()
        const serializer = (loggerConfig as LoggerConfigWithSerializers)
          .serializers?.req

        if (serializer) {
          const mockRequest = {
            method: 'GET',
            url: '/api/test?apiKey=secret123&other=value',
            headers: {},
            ip: '127.0.0.1',
            socket: {},
          } as unknown as FastifyRequest

          const result = serializer(mockRequest)

          expect(result.url).toBe('/api/test?apiKey=[REDACTED]&other=value')
          expect(result.url).not.toContain('secret123')
        }
      })

      it('should redact password query parameter', async () => {
        const module = await import('@utils/logger.js')
        const loggerConfig = module.createLoggerConfig()
        const serializer = (loggerConfig as LoggerConfigWithSerializers)
          .serializers?.req

        if (serializer) {
          const mockRequest = {
            method: 'POST',
            url: '/auth?password=supersecret',
            headers: {},
            ip: '127.0.0.1',
            socket: {},
          } as unknown as FastifyRequest

          const result = serializer(mockRequest)

          expect(result.url).toBe('/auth?password=[REDACTED]')
          expect(result.url).not.toContain('supersecret')
        }
      })

      it('should redact token query parameter', async () => {
        const module = await import('@utils/logger.js')
        const loggerConfig = module.createLoggerConfig()
        const serializer = (loggerConfig as LoggerConfigWithSerializers)
          .serializers?.req

        if (serializer) {
          const mockRequest = {
            method: 'GET',
            url: '/api/data?token=bearer_token_123',
            headers: {},
            ip: '127.0.0.1',
            socket: {},
          } as unknown as FastifyRequest

          const result = serializer(mockRequest)

          expect(result.url).toBe('/api/data?token=[REDACTED]')
          expect(result.url).not.toContain('bearer_token_123')
        }
      })

      it('should redact plexToken query parameter', async () => {
        const module = await import('@utils/logger.js')
        const loggerConfig = module.createLoggerConfig()
        const serializer = (loggerConfig as LoggerConfigWithSerializers)
          .serializers?.req

        if (serializer) {
          const mockRequest = {
            method: 'GET',
            url: '/plex/library?plexToken=abc123xyz',
            headers: {},
            ip: '127.0.0.1',
            socket: {},
          } as unknown as FastifyRequest

          const result = serializer(mockRequest)

          expect(result.url).toBe('/plex/library?plexToken=[REDACTED]')
          expect(result.url).not.toContain('abc123xyz')
        }
      })

      it('should redact X-Plex-Token query parameter', async () => {
        const module = await import('@utils/logger.js')
        const loggerConfig = module.createLoggerConfig()
        const serializer = (loggerConfig as LoggerConfigWithSerializers)
          .serializers?.req

        if (serializer) {
          const mockRequest = {
            method: 'GET',
            url: '/plex/api?X-Plex-Token=xyz789',
            headers: {},
            ip: '127.0.0.1',
            socket: {},
          } as unknown as FastifyRequest

          const result = serializer(mockRequest)

          expect(result.url).toBe('/plex/api?X-Plex-Token=[REDACTED]')
          expect(result.url).not.toContain('xyz789')
        }
      })

      it('should be case-insensitive for sensitive parameters', async () => {
        const module = await import('@utils/logger.js')
        const loggerConfig = module.createLoggerConfig()
        const serializer = (loggerConfig as LoggerConfigWithSerializers)
          .serializers?.req

        if (serializer) {
          const mockRequest = {
            method: 'GET',
            url: '/api?APIKEY=secret&Password=pass&TOKEN=tok',
            headers: {},
            ip: '127.0.0.1',
            socket: {},
          } as unknown as FastifyRequest

          const result = serializer(mockRequest)

          // The regex replaces case-insensitively but also normalizes the param names
          expect(result.url).toBe(
            '/api?apiKey=[REDACTED]&password=[REDACTED]&token=[REDACTED]',
          )
        }
      })

      it('should redact multiple sensitive parameters', async () => {
        const module = await import('@utils/logger.js')
        const loggerConfig = module.createLoggerConfig()
        const serializer = (loggerConfig as LoggerConfigWithSerializers)
          .serializers?.req

        if (serializer) {
          const mockRequest = {
            method: 'GET',
            url: '/api?apiKey=key123&user=john&password=pass456&token=tok789',
            headers: {},
            ip: '127.0.0.1',
            socket: {},
          } as unknown as FastifyRequest

          const result = serializer(mockRequest)

          expect(result.url).toBe(
            '/api?apiKey=[REDACTED]&user=john&password=[REDACTED]&token=[REDACTED]',
          )
          expect(result.url).toContain('user=john')
          expect(result.url).not.toContain('key123')
          expect(result.url).not.toContain('pass456')
          expect(result.url).not.toContain('tok789')
        }
      })

      it('should preserve non-sensitive query parameters', async () => {
        const module = await import('@utils/logger.js')
        const loggerConfig = module.createLoggerConfig()
        const serializer = (loggerConfig as LoggerConfigWithSerializers)
          .serializers?.req

        if (serializer) {
          const mockRequest = {
            method: 'GET',
            url: '/api?page=1&limit=10&sort=desc',
            headers: {},
            ip: '127.0.0.1',
            socket: {},
          } as unknown as FastifyRequest

          const result = serializer(mockRequest)

          expect(result.url).toBe('/api?page=1&limit=10&sort=desc')
        }
      })

      it('should handle URLs with no query parameters', async () => {
        const module = await import('@utils/logger.js')
        const loggerConfig = module.createLoggerConfig()
        const serializer = (loggerConfig as LoggerConfigWithSerializers)
          .serializers?.req

        if (serializer) {
          const mockRequest = {
            method: 'GET',
            url: '/api/users',
            headers: {},
            ip: '127.0.0.1',
            socket: {},
          } as unknown as FastifyRequest

          const result = serializer(mockRequest)

          expect(result.url).toBe('/api/users')
        }
      })
    })
  })
})
