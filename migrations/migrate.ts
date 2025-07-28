import knex from 'knex'
import config from './knexfile.js'
import dotenv from 'dotenv'

// Load environment variables from .env file
dotenv.config()

/**
 * Applies all pending database migrations using the development configuration.
 *
 * Terminates the process with exit code 1 if migration fails. Ensures the database connection is closed after completion.
 */
async function migrate() {
  const db = knex(config.development)

  try {
    await db.migrate.latest()
    console.log('Migrations completed successfully')
  } catch (err) {
    console.error('Error running migrations:', err)
    process.exit(1)
  } finally {
    await db.destroy()
  }
}

migrate()
