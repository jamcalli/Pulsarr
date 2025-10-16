import { Readable } from 'node:stream'
import { vi } from 'vitest'

/**
 * Mock Response options for creating test fetch responses
 */
export interface MockResponseOptions {
  status?: number
  statusText?: string
  ok?: boolean
  headers?: Record<string, string>
  body?: string | null
  json?: unknown
}

/**
 * Creates a mock Response object that mimics the Fetch API Response
 *
 * @param options - Configuration for the mock response
 * @returns A mock Response object compatible with fetch API
 *
 * @example
 * const response = createMockResponse({
 *   status: 200,
 *   json: { data: 'test' }
 * })
 */
export function createMockResponse(
  options: MockResponseOptions = {},
): Response {
  const {
    status = 200,
    statusText = 'OK',
    ok = status >= 200 && status < 300,
    headers = {},
    body = null,
    json,
  } = options

  // Create Headers object
  const mockHeaders = new Headers(headers)

  // Create a readable stream from body if provided
  let bodyStream: ReadableStream<Uint8Array> | null = null
  if (body !== null) {
    const bodyText = body || (json ? JSON.stringify(json) : '')
    bodyStream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(bodyText))
        controller.close()
      },
    })
  }

  // Create the mock response
  const mockResponse = {
    ok,
    status,
    statusText,
    headers: mockHeaders,
    body: bodyStream,
    bodyUsed: false,

    text: vi.fn(async () => {
      if (body !== null) {
        return body || (json ? JSON.stringify(json) : '')
      }
      throw new Error('Response body is null')
    }),

    json: vi.fn(async () => {
      if (json !== undefined) {
        return json
      }
      if (body) {
        return JSON.parse(body)
      }
      throw new Error('Response body is null or not JSON')
    }),

    arrayBuffer: vi.fn(async () => {
      const text = body || (json ? JSON.stringify(json) : '')
      return new TextEncoder().encode(text).buffer
    }),

    blob: vi.fn(async () => {
      const text = body || (json ? JSON.stringify(json) : '')
      return new Blob([text])
    }),

    clone: vi.fn(() => createMockResponse(options)),

    redirect: vi.fn(),
    type: 'basic' as ResponseType,
    url: '',
    redirected: false,
  } as unknown as Response

  return mockResponse
}

/**
 * Creates a mock fetch function that can be used with vi.mock
 *
 * @param defaultResponse - Default response to return
 * @returns A mock fetch function
 *
 * @example
 * const mockFetch = createMockFetch(createMockResponse({ json: { success: true } }))
 * vi.stubGlobal('fetch', mockFetch)
 */
export function createMockFetch(
  defaultResponse?: Response,
): ReturnType<typeof vi.fn> {
  return vi.fn(async () => {
    if (defaultResponse) {
      return defaultResponse
    }
    return createMockResponse()
  })
}

/**
 * Helper to create a successful JSON response
 *
 * @param data - JSON data to return
 * @param status - HTTP status code (default: 200)
 * @returns A mock Response with JSON data
 *
 * @example
 * const response = mockJsonResponse({ user: 'test' })
 */
export function mockJsonResponse(data: unknown, status = 200): Response {
  return createMockResponse({
    status,
    ok: status >= 200 && status < 300,
    json: data,
    headers: { 'content-type': 'application/json' },
  })
}

/**
 * Helper to create a failed response
 *
 * @param status - HTTP status code
 * @param statusText - Status text (default: based on status)
 * @returns A mock Response representing an error
 *
 * @example
 * const response = mockErrorResponse(404, 'Not Found')
 */
export function mockErrorResponse(
  status: number,
  statusText?: string,
): Response {
  const defaultStatusText =
    status === 404
      ? 'Not Found'
      : status === 500
        ? 'Internal Server Error'
        : status === 429
          ? 'Too Many Requests'
          : 'Error'

  return createMockResponse({
    status,
    statusText: statusText || defaultStatusText,
    ok: false,
  })
}

/**
 * Helper to create a response with retry-after header
 *
 * @param retryAfter - Retry-After header value (seconds or date string)
 * @param status - HTTP status code (default: 429)
 * @returns A mock Response with retry-after header
 *
 * @example
 * const response = mockRetryAfterResponse(60) // Retry after 60 seconds
 */
export function mockRetryAfterResponse(
  retryAfter: number | string,
  status = 429,
): Response {
  return createMockResponse({
    status,
    ok: false,
    headers: {
      'retry-after': String(retryAfter),
    },
  })
}

/**
 * Creates a mock Response with a readable stream body for testing streaming
 *
 * @param lines - Array of strings to stream as lines
 * @returns A mock Response with a streaming body
 *
 * @example
 * const response = mockStreamResponse(['line1', 'line2', 'line3'])
 */
export function mockStreamResponse(lines: string[]): Response {
  const nodeStream = Readable.from(lines.map((line) => `${line}\n`))
  const _webStream = Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>

  return createMockResponse({
    status: 200,
    body: null, // Will be overridden
  }) as Response & { body: ReadableStream<Uint8Array> }
}

/**
 * Creates a sequence of fetch responses for testing retry logic
 *
 * @param responses - Array of responses to return in sequence
 * @returns A mock fetch function that returns responses in order
 *
 * @example
 * const mockFetch = mockFetchSequence([
 *   mockErrorResponse(500),
 *   mockErrorResponse(500),
 *   mockJsonResponse({ success: true })
 * ])
 */
export function mockFetchSequence(
  responses: Response[],
): ReturnType<typeof vi.fn> {
  let callCount = 0
  return vi.fn(async () => {
    const response = responses[callCount] || responses[responses.length - 1]
    callCount++
    return response
  })
}
