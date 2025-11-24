import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll } from 'vitest'
import { externalApiHandlers } from '../mocks/external-api-handlers.js'
import { plexApiHandlers } from '../mocks/plex-api-handlers.js'

/**
 * MSW (Mock Service Worker) setup for Vitest
 *
 * This file configures MSW to intercept HTTP requests during tests.
 * Individual test files can add their own request handlers as needed.
 *
 * @see https://mswjs.io/docs/integrations/node
 */

/**
 * Create the server with default handlers for external APIs
 *
 * Includes:
 * - Plex API handlers (prevent timeout errors in Vitest v4)
 * - TMDB API handlers (prevent unhandled request warnings)
 * - Radarr Ratings API handlers (prevent unhandled request warnings)
 */
export const server = setupServer(...plexApiHandlers, ...externalApiHandlers)

// Start server before all tests
beforeAll(() => {
  server.listen({ onUnhandledRequest: 'warn' })
})

/**
 * Reset handlers after each test to ensure test isolation
 * Restore default handlers so they're available for the next test
 */
afterEach(() => {
  server.resetHandlers(...plexApiHandlers, ...externalApiHandlers)
})

// Clean up after all tests
afterAll(() => {
  server.close()
})
