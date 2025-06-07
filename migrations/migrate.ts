import knex from 'knex'
import config from './knexfile.js'
import dotenv from 'dotenv'

// Load environment variables from .env file
dotenv.config()

async function migrate() {
  const db = knex(config.development)

  try {
    await db.migrate.latest()
    console.log('Migrations completed successfully')
  } catch (err) {
    console.error('Error running migrations:', err)
  } finally {
    await db.destroy()
  }
}

migrate()
