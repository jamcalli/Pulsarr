import type { Knex } from 'knex'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const projectRoot = join(__dirname, '..')

const config: { [key: string]: Knex.Config } = {
  development: {
    client: 'better-sqlite3',
    connection: {
      filename: join(projectRoot, 'data', 'db', 'plexwatchlist.db')
    },
    useNullAsDefault: true,
    migrations: {
      directory: join(__dirname, 'migrations')
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