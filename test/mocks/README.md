# Test Mocks

This directory contains shared mock utilities for use across all tests.

## Available Mocks

### Logger Mock (`logger.ts`)

Shared mock logger for all tests. Use this instead of creating inline logger mocks.

```ts
import { createMockLogger } from '../mocks/logger.js'

const logger = createMockLogger()
```

### MSW Handlers (`msw-handlers.ts`)

Example MSW (Mock Service Worker) request handlers demonstrating common patterns. These are reference examples - create your own handlers in individual test files.

**Note:** MSW is configured globally in `test/setup/msw-setup.ts` and automatically available in all tests.

## Using MSW in Tests

MSW is the official Vitest recommendation for mocking HTTP requests. It intercepts requests at the network level, providing realistic and maintainable mocks.

### Basic Usage

```ts
import { describe, it, expect } from 'vitest'
import { server } from '../setup/msw-setup.js'
import { http, HttpResponse } from 'msw'

describe('my test suite', () => {
  it('mocks a fetch request', async () => {
    // Add a request handler for this specific test
    server.use(
      http.get('https://api.example.com/data', () => {
        return HttpResponse.json({ message: 'success' })
      })
    )

    const response = await fetch('https://api.example.com/data')
    const data = await response.json()

    expect(data).toEqual({ message: 'success' })
  })
})
```

### Common Patterns

#### JSON Response
```ts
server.use(
  http.get('https://api.example.com/users', () => {
    return HttpResponse.json([
      { id: 1, name: 'Alice' },
      { id: 2, name: 'Bob' }
    ])
  })
)
```

#### Custom Status Code
```ts
server.use(
  http.get('https://api.example.com/error', () => {
    return new HttpResponse(null, { status: 404 })
  })
)
```

#### Network Error
```ts
server.use(
  http.get('https://api.example.com/fail', () => {
    return HttpResponse.error()
  })
)
```

#### POST with Request Body
```ts
server.use(
  http.post('https://api.example.com/users', async ({ request }) => {
    const body = await request.json()
    return HttpResponse.json({ id: 3, ...body }, { status: 201 })
  })
)
```

#### Query Parameters
```ts
server.use(
  http.get('https://api.example.com/search', ({ request }) => {
    const url = new URL(request.url)
    const query = url.searchParams.get('q')
    return HttpResponse.json({ query, results: [] })
  })
)
```

#### Auth Headers
```ts
server.use(
  http.get('https://api.example.com/protected', ({ request }) => {
    const token = request.headers.get('Authorization')

    if (!token?.startsWith('Bearer ')) {
      return new HttpResponse(null, { status: 401 })
    }

    return HttpResponse.json({ authenticated: true })
  })
)
```

#### Streaming Response
```ts
server.use(
  http.get('https://api.example.com/stream', () => {
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('line1\n'))
        controller.enqueue(encoder.encode('line2\n'))
        controller.close()
      }
    })

    return new HttpResponse(stream, {
      headers: { 'Content-Type': 'text/plain' }
    })
  })
)
```

#### Delayed Response (Timeout Testing)
```ts
server.use(
  http.get('https://api.example.com/slow', async () => {
    await new Promise(resolve => setTimeout(resolve, 5000))
    return HttpResponse.json({ data: 'finally!' })
  })
)
```

### Test Isolation

MSW is configured to automatically reset handlers after each test via `server.resetHandlers()` in the global setup file. This ensures test isolation - handlers added with `server.use()` only apply to that specific test.

### Multiple Handlers

You can add multiple handlers in a single test:

```ts
it('handles multiple endpoints', async () => {
  server.use(
    http.get('https://api.example.com/users', () => {
      return HttpResponse.json([{ id: 1, name: 'Alice' }])
    }),
    http.get('https://api.example.com/posts', () => {
      return HttpResponse.json([{ id: 1, title: 'Hello' }])
    })
  )

  const users = await fetch('https://api.example.com/users').then(r => r.json())
  const posts = await fetch('https://api.example.com/posts').then(r => r.json())

  expect(users).toHaveLength(1)
  expect(posts).toHaveLength(1)
})
```

### Pattern Matching

MSW supports wildcards and path patterns:

```ts
// Match any subdomain
http.get('https://*.example.com/api', () => { ... })

// Match path parameters
http.get('https://api.example.com/users/:id', ({ params }) => {
  const { id } = params
  return HttpResponse.json({ id, name: 'User' })
})

// Match any path
http.get('https://api.example.com/*', () => { ... })
```

## Resources

- [MSW Documentation](https://mswjs.io/docs/)
- [MSW Node.js Integration](https://mswjs.io/docs/integrations/node)
- [Vitest MSW Guide](https://vitest.dev/guide/mocking.html#requests)
