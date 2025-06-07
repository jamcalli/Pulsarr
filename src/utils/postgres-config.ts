/**
 * PostgreSQL configuration utilities
 *
 * Handles PostgreSQL-specific configuration including type parsers
 */
import type { FastifyBaseLogger } from 'fastify'
import type { types as PgTypes } from 'pg'

// Track if type parsers have been configured to prevent duplicate setup
let pgTypesConfigured = false

/**
 * Configure PostgreSQL type parsers to return dates and JSON as strings
 * This makes PostgreSQL behave like SQLite for existing code compatibility
 *
 * @param log - Fastify logger instance for logging configuration status
 */
export async function configurePgTypes(log: FastifyBaseLogger): Promise<void> {
  if (pgTypesConfigured) return

  try {
    const pg = await import('pg')
    const types = pg.default.types

    if (types && typeof types === 'object' && 'setTypeParser' in types) {
      const typesParser = types as typeof PgTypes

      // Dates and timestamps - return as strings
      typesParser.setTypeParser(1082, (str: string) => str) // date
      typesParser.setTypeParser(1114, (str: string) => str) // timestamp without timezone
      typesParser.setTypeParser(1184, (str: string) => str) // timestamp with timezone
      typesParser.setTypeParser(1083, (str: string) => str) // time without timezone
      typesParser.setTypeParser(1266, (str: string) => str) // time with timezone

      // JSON types - return as strings for JSON.parse() compatibility
      typesParser.setTypeParser(114, (str: string) => str) // json
      typesParser.setTypeParser(3802, (str: string) => str) // jsonb

      pgTypesConfigured = true
      log.debug('PostgreSQL type parsers configured successfully')
    } else {
      log.warn('PostgreSQL types.setTypeParser not available')
    }
  } catch (error) {
    log.warn('Failed to configure PostgreSQL type parsers:', error)
  }
}
