import type { FastifyBaseLogger } from 'fastify'
import { vi } from 'vitest'

/**
 * Create a mock Fastify logger for testing
 * All logging methods (trace, debug, info, warn, error, fatal) are mocked with vi.fn()
 *
 * @returns A mock FastifyBaseLogger instance with all methods stubbed
 *
 * @example
 * const logger = createMockLogger()
 * someFunction(logger)
 * expect(logger.error).toHaveBeenCalledWith(...)
 */
export function createMockLogger(): FastifyBaseLogger {
  return {
    trace: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
    child: vi.fn(),
    silent: vi.fn(),
    level: 'info',
  } as unknown as FastifyBaseLogger
}
