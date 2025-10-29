import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll } from 'vitest'
import { plexApiHandlers } from '../mocks/plex-api-handlers.js'

/**
 * MSW (Mock Service Worker) setup for Vitest
 *
 * This file configures MSW to intercept HTTP requests during tests.
 * Individual test files can add their own request handlers as needed.
 *
 * @see https://mswjs.io/docs/integrations/node
 */

// Create the server with default handlers for external APIs
// Vitest v4's fork pool rewrite is better at catching unhandled rejections,
// so we need to mock Plex API calls that timeout after tests complete
export const server = setupServer(...plexApiHandlers)

// Start server before all tests
beforeAll(() => {
  server.listen({ onUnhandledRequest: 'warn' })
})

// Reset handlers after each test to ensure test isolation
// Restore default handlers so they're available for the next test
afterEach(() => {
  server.resetHandlers(...plexApiHandlers)
})

// Clean up after all tests
afterAll(() => {
  server.close()
})
