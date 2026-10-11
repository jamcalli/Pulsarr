import { getResponse, isPassthroughResponse, type RequestHandler } from 'msw'
import { afterAll, afterEach, beforeAll } from 'vitest'
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
  resetHandlers(): void {
    handlers = [...defaultHandlers]
  },
}

beforeAll(() => {
  globalThis.fetch = mockedFetch as typeof fetch
})

afterEach(() => {
  server.resetHandlers()
})

afterAll(() => {
  globalThis.fetch = realFetch
})
