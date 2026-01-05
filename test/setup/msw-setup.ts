import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, vi } from 'vitest'
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
