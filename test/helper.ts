/**
 * Legacy test helper file - Re-exports from organized helper modules
 *
 * This file maintains backward compatibility with existing tests.
 * New tests should import directly from the specific helper modules:
 * - test/helpers/database.ts - Database setup and reset utilities
 * - test/helpers/app.ts - Fastify app builder
 * - test/helpers/assertions.ts - Common test assertions
 * - test/mocks/logger.ts - Mock logger factory
 */

export { build } from './helpers/app.js'
export { expectValidationError } from './helpers/assertions.js'
export {
  cleanupTestDatabase,
  getTestDatabase,
  initializeTestDatabase,
  resetDatabase,
} from './helpers/database.js'
