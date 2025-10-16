import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockLogger } from '../../mocks/logger.js'

describe('postgres-config', () => {
  describe('configurePgTypes', () => {
    let mockLogger: ReturnType<typeof createMockLogger>

    beforeEach(() => {
      mockLogger = createMockLogger()
      vi.resetModules()
    })

    it('should configure PostgreSQL type parsers successfully', async () => {
      const mockSetTypeParser = vi.fn()
      const mockTypes = {
        setTypeParser: mockSetTypeParser,
      }

      vi.doMock('pg', () => ({
        default: {
          types: mockTypes,
        },
      }))

      const { configurePgTypes: configFn } = await import(
        '../../../src/utils/postgres-config.js'
      )
      await configFn(mockLogger)

      // Verify all type parsers were set
      expect(mockSetTypeParser).toHaveBeenCalledTimes(7)

      // Verify date/timestamp types
      expect(mockSetTypeParser).toHaveBeenCalledWith(1082, expect.any(Function)) // date
      expect(mockSetTypeParser).toHaveBeenCalledWith(1114, expect.any(Function)) // timestamp without timezone
      expect(mockSetTypeParser).toHaveBeenCalledWith(1184, expect.any(Function)) // timestamp with timezone
      expect(mockSetTypeParser).toHaveBeenCalledWith(1083, expect.any(Function)) // time without timezone
      expect(mockSetTypeParser).toHaveBeenCalledWith(1266, expect.any(Function)) // time with timezone

      // Verify JSON types
      expect(mockSetTypeParser).toHaveBeenCalledWith(114, expect.any(Function)) // json
      expect(mockSetTypeParser).toHaveBeenCalledWith(3802, expect.any(Function)) // jsonb

      expect(mockLogger.debug).toHaveBeenCalledWith(
        'PostgreSQL type parsers configured successfully',
      )
    })

    it('should return strings unchanged for date parsers', async () => {
      const mockSetTypeParser = vi.fn()
      const mockTypes = {
        setTypeParser: mockSetTypeParser,
      }

      vi.doMock('pg', () => ({
        default: {
          types: mockTypes,
        },
      }))

      const { configurePgTypes: configFn } = await import(
        '../../../src/utils/postgres-config.js'
      )
      await configFn(mockLogger)

      // Get the parser function for date type (1082)
      const dateParserCall = mockSetTypeParser.mock.calls.find(
        (call) => call[0] === 1082,
      )
      expect(dateParserCall).toBeDefined()

      const parserFn = dateParserCall?.[1]
      expect(parserFn).toBeTypeOf('function')

      // Test that it returns the string unchanged
      const testDate = '2024-01-15'
      expect(parserFn(testDate)).toBe(testDate)
    })

    it('should return strings unchanged for JSON parsers', async () => {
      const mockSetTypeParser = vi.fn()
      const mockTypes = {
        setTypeParser: mockSetTypeParser,
      }

      vi.doMock('pg', () => ({
        default: {
          types: mockTypes,
        },
      }))

      const { configurePgTypes: configFn } = await import(
        '../../../src/utils/postgres-config.js'
      )
      await configFn(mockLogger)

      // Get the parser function for json type (114)
      const jsonParserCall = mockSetTypeParser.mock.calls.find(
        (call) => call[0] === 114,
      )
      expect(jsonParserCall).toBeDefined()

      const parserFn = jsonParserCall?.[1]
      expect(parserFn).toBeTypeOf('function')

      // Test that it returns the string unchanged
      const testJson = '{"key":"value"}'
      expect(parserFn(testJson)).toBe(testJson)
    })

    it('should be idempotent and not configure twice', async () => {
      const mockSetTypeParser = vi.fn()
      const mockTypes = {
        setTypeParser: mockSetTypeParser,
      }

      vi.doMock('pg', () => ({
        default: {
          types: mockTypes,
        },
      }))

      const { configurePgTypes: configFn } = await import(
        '../../../src/utils/postgres-config.js'
      )

      // Call twice
      await configFn(mockLogger)
      await configFn(mockLogger)

      // Should only be called once (7 parsers)
      expect(mockSetTypeParser).toHaveBeenCalledTimes(7)
      expect(mockLogger.debug).toHaveBeenCalledTimes(1)
    })

    it('should log warning if setTypeParser is not available', async () => {
      vi.doMock('pg', () => ({
        default: {
          types: {}, // No setTypeParser method
        },
      }))

      const { configurePgTypes: configFn } = await import(
        '../../../src/utils/postgres-config.js'
      )
      await configFn(mockLogger)

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'PostgreSQL types.setTypeParser not available',
      )
      expect(mockLogger.debug).not.toHaveBeenCalled()
    })

    it('should log warning if pg module import fails', async () => {
      vi.doMock('pg', () => {
        throw new Error('Module not found')
      })

      const { configurePgTypes: configFn } = await import(
        '../../../src/utils/postgres-config.js'
      )
      await configFn(mockLogger)

      expect(mockLogger.warn).toHaveBeenCalledWith(
        { error: expect.any(Error) },
        'Failed to configure PostgreSQL type parsers',
      )
      expect(mockLogger.debug).not.toHaveBeenCalled()
    })

    it('should handle types being undefined', async () => {
      vi.doMock('pg', () => ({
        default: {
          types: undefined,
        },
      }))

      const { configurePgTypes: configFn } = await import(
        '../../../src/utils/postgres-config.js'
      )
      await configFn(mockLogger)

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'PostgreSQL types.setTypeParser not available',
      )
    })

    it('should handle types being null', async () => {
      vi.doMock('pg', () => ({
        default: {
          types: null,
        },
      }))

      const { configurePgTypes: configFn } = await import(
        '../../../src/utils/postgres-config.js'
      )
      await configFn(mockLogger)

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'PostgreSQL types.setTypeParser not available',
      )
    })

    it('should handle types not being an object', async () => {
      vi.doMock('pg', () => ({
        default: {
          types: 'not an object',
        },
      }))

      const { configurePgTypes: configFn } = await import(
        '../../../src/utils/postgres-config.js'
      )
      await configFn(mockLogger)

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'PostgreSQL types.setTypeParser not available',
      )
    })
  })
})
