import knex from 'knex'
import config from './knexfile.js'

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