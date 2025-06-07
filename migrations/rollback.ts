import knex from 'knex'
import config from './knexfile.js'

/**
 * Rolls back the latest database migration using the development environment configuration.
 *
 * Ensures the database connection is closed after the rollback attempt, regardless of success or failure.
 */
async function rollback() {
  const db = knex(config.development)

  try {
    await db.migrate.rollback()
    console.log('Migration rolled back successfully')
  } catch (err) {
    console.error('Error rolling back migration:', err)
  } finally {
    await db.destroy()
  }
}

rollback()
