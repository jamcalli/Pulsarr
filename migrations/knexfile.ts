import type { Knex } from 'knex'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'
import fs from 'node:fs'
import dotenv from 'dotenv'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const projectRoot = resolve(__dirname, '..')

// Load environment variables before anything else
dotenv.config({ path: resolve(projectRoot, '.env') })

function ensureDbDirectory() {
  const dbDirectory = resolve(projectRoot, 'data', 'db')
  try {
    if (!fs.existsSync(dbDirectory)) {
      fs.mkdirSync(dbDirectory, { recursive: true })
    }
    return dbDirectory
  } catch (err) {
    console.error('Failed to create database directory:', err)
    process.exit(1)
  }
}

// Helper to determine database type from environment
const dbType = process.env.dbType || 'sqlite'
const isPostgres = dbType === 'postgres'

// Build PostgreSQL connection configuration
const getPostgresConnection = () => {
  // If connection string is provided, use it
  if (process.env.dbConnectionString) {
    return process.env.dbConnectionString
  }
  
  // Parse and validate port number
  const port = parseInt(process.env.dbPort || '5432', 10)
  if (isNaN(port) || port < 1 || port > 65535) {
    throw new Error('Invalid database port number')
  }
  
  // Otherwise, build from individual components
  return {
    host: process.env.dbHost || 'localhost',
    port,
    user: process.env.dbUser || 'postgres',
    password: process.env.dbPassword || undefined,
    database: process.env.dbName || 'pulsarr'
  }
}

// Build SQLite connection configuration
const getSqliteConnection = () => ({
  filename: process.env.dbPath || resolve(ensureDbDirectory(), 'pulsarr.db')
})

const config: { [key: string]: Knex.Config } = {
  development: {
    client: isPostgres ? 'pg' : 'better-sqlite3',
    connection: isPostgres ? getPostgresConnection() : getSqliteConnection(),
    useNullAsDefault: !isPostgres,
    migrations: {
      directory: resolve(__dirname, 'migrations')
    },
    pool: isPostgres 
      ? { 
          min: 2, 
          max: 10 
        }
      : {
          afterCreate: (conn: any, cb: any) => {
            conn.exec('PRAGMA journal_mode = WAL;')
            conn.exec('PRAGMA foreign_keys = ON;')
            cb()
          }
        }
  }
}

export default config