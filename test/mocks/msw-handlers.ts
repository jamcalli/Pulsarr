import { HttpResponse, http } from 'msw'

/**
 * Example MSW request handlers
 *
 * This file contains example handlers that demonstrate common patterns.
 * Individual test files should create their own handlers as needed.
 *
 * Usage in tests:
 * ```ts
 * import { server } from '../setup/msw-setup.js'
 * import { http, HttpResponse } from 'msw'
 *
 * it('test name', async () => {
 *   server.use(
 *     http.get('https://api.example.com/data', () => {
 *       return HttpResponse.json({ data: 'test' })
 *     })
 *   )
 *
 *   // Your test code...
 * })
 * ```
 *
 * @see https://mswjs.io/docs/basics/request-handler
 */

// Example: Simple JSON response
export const jsonHandler = http.get('https://api.example.com/json', () => {
  return HttpResponse.json({ message: 'success', data: [] })
})

// Example: Response with custom status
export const notFoundHandler = http.get(
  'https://api.example.com/not-found',
  () => {
    return new HttpResponse(null, { status: 404 })
  },
)

// Example: Network error simulation
export const networkErrorHandler = http.get(
  'https://api.example.com/network-error',
  () => {
    return HttpResponse.error()
  },
)

// Example: Delayed response (for timeout testing)
export const delayedHandler = http.get(
  'https://api.example.com/delayed',
  async () => {
    await new Promise((resolve) => setTimeout(resolve, 5000))
    return HttpResponse.json({ message: 'delayed response' })
  },
)

// Example: Response based on request body (POST)
export const postHandler = http.post(
  'https://api.example.com/data',
  async ({ request }) => {
    const body = await request.json()
    return HttpResponse.json({ received: body }, { status: 201 })
  },
)

// Example: Response based on query parameters
export const queryHandler = http.get(
  'https://api.example.com/search',
  ({ request }) => {
    const url = new URL(request.url)
    const query = url.searchParams.get('q')
    return HttpResponse.json({ query, results: [] })
  },
)

// Example: Response based on headers
export const authHandler = http.get(
  'https://api.example.com/protected',
  ({ request }) => {
    const authHeader = request.headers.get('Authorization')

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new HttpResponse(null, { status: 401 })
    }

    return HttpResponse.json({ authenticated: true })
  },
)

// Example: Streaming response (for gzip/streaming tests)
export const streamHandler = http.get('https://api.example.com/stream', () => {
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode('chunk1\n'))
      controller.enqueue(encoder.encode('chunk2\n'))
      controller.enqueue(encoder.encode('chunk3\n'))
      controller.close()
    },
  })

  return new HttpResponse(stream, {
    headers: {
      'Content-Type': 'text/plain',
      'Transfer-Encoding': 'chunked',
    },
  })
})

/**
 * Common handler patterns exported as a collection
 * These are not registered by default - they're examples only
 */
export const exampleHandlers = [
  jsonHandler,
  notFoundHandler,
  networkErrorHandler,
  delayedHandler,
  postHandler,
  queryHandler,
  authHandler,
  streamHandler,
]
