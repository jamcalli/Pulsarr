import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll } from 'vitest'

/**
 * MSW (Mock Service Worker) setup for Vitest
 *
 * This file configures MSW to intercept HTTP requests during tests.
 * Individual test files can add their own request handlers as needed.
 *
 * @see https://mswjs.io/docs/integrations/node
 */

// Create the server with no default handlers
// Individual tests will add their own handlers as needed
export const server = setupServer()

// Start server before all tests
beforeAll(() => {
  server.listen({ onUnhandledRequest: 'warn' })
})

// Reset handlers after each test to ensure test isolation
afterEach(() => {
  server.resetHandlers()
})

// Clean up after all tests
afterAll(() => {
  server.close()
})
