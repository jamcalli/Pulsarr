import { getResponse, isPassthroughResponse, type RequestHandler } from 'msw'
import { afterAll, afterEach, beforeAll, vi } from 'vitest'
import { externalApiHandlers } from '../mocks/external-api-handlers.js'
import { plexApiHandlers } from '../mocks/plex-api-handlers.js'

const defaultHandlers: RequestHandler[] = [
  ...plexApiHandlers,
  ...externalApiHandlers,
]
let handlers = [...defaultHandlers]
const realFetch = globalThis.fetch

function abortError(signal: AbortSignal): Error {
  return signal.reason instanceof Error
    ? signal.reason
    : new DOMException('This operation was aborted', 'AbortError')
}

// msw/node hooks Node socket internals Bun lacks, so the global fetch is swapped for a getResponse lookup instead
async function mockedFetch(
  input: string | URL | Request,
  init?: RequestInit,
): Promise<Response> {
  const request = new Request(input, init)
  const signal = init?.signal ?? request.signal
  if (signal.aborted) throw abortError(signal)
  const listener = new AbortController()
  const aborted = new Promise<never>((_, reject) => {
    signal.addEventListener('abort', () => reject(abortError(signal)), {
      signal: listener.signal,
    })
  })
  try {
    const response = await Promise.race([
      getResponse(handlers, request.clone()),
      aborted,
    ])
    if (response === undefined || isPassthroughResponse(response)) {
      return realFetch(request)
    }
    if (response.type === 'error') throw new TypeError('Failed to fetch')
    return response
  } finally {
    listener.abort()
  }
}

export const server = {
  use(...added: RequestHandler[]): void {
    handlers = [...added, ...handlers]
  },
  resetHandlers(...next: RequestHandler[]): void {
    handlers = next.length > 0 ? [...next] : [...defaultHandlers]
  },
}

// Suppress migration console.log noise in tests
const originalLog = console.log
vi.spyOn(console, 'log').mockImplementation((...args) => {
  const msg = String(args[0] ?? '')
  // Filter out migration and setup noise in tests
  if (
    msg.includes('Migration') ||
    msg.includes('migration') ||
    msg.includes('Seeded') ||
    msg.includes('PostgreSQL') ||
    msg.includes('admin users') ||
    msg.includes('router rules') ||
    msg.includes('user_id column') ||
    msg.includes('primary user') ||
    msg.includes('Skipping') ||
    msg.includes('Setting up logger')
  ) {
    return
  }
  originalLog(...args)
})

beforeAll(() => {
  globalThis.fetch = mockedFetch as typeof fetch
})

/**
 * Reset handlers after each test to ensure test isolation
 * Restore default handlers so they're available for the next test
 */
afterEach(() => {
  server.resetHandlers(...plexApiHandlers, ...externalApiHandlers)
})

afterAll(() => {
  globalThis.fetch = realFetch
})
