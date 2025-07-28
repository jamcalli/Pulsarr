import knex from 'knex'
import config from './knexfile.js'
import dotenv from 'dotenv'

// Load environment variables from .env file
dotenv.config()

/**
 * Runs the latest database migrations using the development configuration.
 *
 * Ensures that all pending migrations are applied and the database connection is properly closed, regardless of success or failure.
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
