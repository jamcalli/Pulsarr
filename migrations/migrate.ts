import dotenv from 'dotenv'
import knex from 'knex'
import config from './knexfile.js'

dotenv.config({ quiet: true })

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
