import { getResponse, isPassthroughResponse, type RequestHandler } from 'msw'

export interface FetchMock {
  server: {
    use(...added: RequestHandler[]): void
    resetHandlers(): void
  }
  enable(): void
  disable(): void
}

function abortError(signal: AbortSignal): Error {
  return signal.reason instanceof Error
    ? signal.reason
    : new DOMException('This operation was aborted', 'AbortError')
}

// msw/node hooks Node socket internals Bun lacks, so the global fetch is swapped for a getResponse lookup instead
export function createFetchMock(
  defaultHandlers: RequestHandler[],
  onUnhandled: 'passthrough' | 'error',
): FetchMock {
  let handlers = [...defaultHandlers]
  const realFetch = globalThis.fetch

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
        if (onUnhandled === 'error') {
          throw new Error(`Unhandled ${request.method} ${request.url}`)
        }
        return realFetch(request)
      }
      if (response.type === 'error') throw new TypeError('Failed to fetch')
      return response
    } finally {
      listener.abort()
    }
  }

  return {
    server: {
      use(...added) {
        handlers = [...added, ...handlers]
      },
      resetHandlers() {
        handlers = [...defaultHandlers]
      },
    },
    enable() {
      globalThis.fetch = mockedFetch as typeof fetch
    },
    disable() {
      globalThis.fetch = realFetch
    },
  }
}
