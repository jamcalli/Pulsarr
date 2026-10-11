import type { FastifyBaseLogger } from 'fastify'
import { vi } from 'vitest'

export function createMockLogger(): FastifyBaseLogger {
  return {
    trace: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
    child: vi.fn(() => createMockLogger()),
    silent: vi.fn(),
    level: 'info',
  }
}
