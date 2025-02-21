import type { Knex } from 'knex'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'
import fs from 'node:fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const projectRoot = resolve(__dirname, '..')

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

const config: { [key: string]: Knex.Config } = {
  development: {
    client: 'better-sqlite3',
    connection: {
      filename: resolve(ensureDbDirectory(), 'plexwatchlist.db')
    },
    useNullAsDefault: true,
    migrations: {
      directory: resolve(__dirname, 'migrations')
    },
    pool: {
      afterCreate: (conn: any, cb: any) => {
        conn.exec('PRAGMA journal_mode = WAL;')
        conn.exec('PRAGMA foreign_keys = ON;')
        cb()
      }
    }
  }
}

export default config