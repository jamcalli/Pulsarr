import fs from 'node:fs/promises'
import { resolve } from 'node:path'
import readline from 'node:readline'
import knex, { type Knex } from 'knex'
import {
  getPostgresConnection,
  getSqliteConnection,
  resolveBackupDir,
} from '../knexfile.js'

interface MigrationConfig {
  source: Knex.Config
  target: Knex.Config
  sqlitePath: string
  batchSize: number
  verbose: boolean
}

function describeError(error: unknown): string {
  if (!(error instanceof Error)) return String(error)
  return error.cause === undefined
    ? error.message
    : `${error.message} (${describeError(error.cause)})`
}

function driverMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  // knex prefixes driver errors with the full SQL and bindings, joined by ' - '
  const separator = message.lastIndexOf(' - ')
  return separator === -1 ? message : message.slice(separator + 3)
}

async function assertUnusedTarget(db: Knex | Knex.Transaction): Promise<void> {
  const [usedConfig] = await db('configs').select('id').limit(1)
  if (usedConfig) {
    throw new Error(
      'Target database has already been used by Pulsarr. Create an empty database and run the setup step again.',
    )
  }
}

class SQLiteToPostgresMigration {
  private sourceDb: Knex
  private targetDb: Knex
  private config: MigrationConfig

  constructor(config: MigrationConfig) {
    this.config = config
    this.sourceDb = knex(config.source)
    this.targetDb = knex(config.target)
  }

  private log(message: string, level: 'info' | 'warn' | 'error' = 'info') {
    const timestamp = new Date().toISOString()
    console.log(`[${timestamp}] ${level.toUpperCase()} ${message}`)
  }

  private async prompt(question: string): Promise<boolean> {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    })

    return new Promise((resolve) => {
      rl.question(`${question} (y/N): `, (answer) => {
        rl.close()
        resolve(answer.toLowerCase() === 'y')
      })
    })
  }

  async verifyConnections(): Promise<void> {
    this.log('Verifying database connections...')

    try {
      await this.sourceDb.raw('SELECT 1')
      this.log('SQLite connection verified')

      await this.targetDb.raw('SELECT 1')
      this.log('PostgreSQL connection verified')
    } catch (error) {
      throw new Error('Database connection failed', { cause: error })
    }
  }

  async getTables(): Promise<string[]> {
    const tables = await this.sourceDb('sqlite_master')
      .where('type', 'table')
      .whereNotIn('name', [
        'sqlite_sequence',
        'knex_migrations',
        'knex_migrations_lock',
      ])
      .pluck('name')

    return tables
  }

  async determineMigrationOrder(tables: string[]): Promise<string[]> {
    const dependencies = new Map<string, Set<string>>()

    for (const table of tables) {
      dependencies.set(table, new Set())
    }

    for (const table of tables) {
      const [tableInfo] = await this.sourceDb.raw(
        `SELECT sql FROM sqlite_master WHERE type='table' AND name=?`,
        [table],
      )
      if (tableInfo?.sql) {
        const references = tableInfo.sql.matchAll(
          /REFERENCES\s+["`']?(\w+)["`']?\s*\(/gi,
        )
        for (const match of references) {
          const referencedTable = match[1]
          if (tables.includes(referencedTable) && referencedTable !== table) {
            dependencies.get(table)?.add(referencedTable)
          }
        }
      }
    }

    const sorted: string[] = []
    const visited = new Set<string>()

    const visit = (table: string) => {
      if (visited.has(table)) return
      visited.add(table)

      for (const dep of dependencies.get(table) || []) {
        if (!visited.has(dep)) {
          visit(dep)
        }
      }

      sorted.push(table)
    }

    for (const table of tables) {
      visit(table)
    }

    return sorted
  }

  async getSequences(): Promise<Map<string, string>> {
    const sequences = new Map<string, string>()

    const result = await this.targetDb.raw(`
      SELECT 
        t.tablename as table_name,
        pg_get_serial_sequence(t.tablename::text, 'id') as sequence_name
      FROM pg_tables t
      JOIN information_schema.columns c 
        ON c.table_name = t.tablename 
        AND c.table_schema = t.schemaname
      WHERE t.schemaname = 'public'
      AND c.column_name = 'id'
      AND t.tablename NOT IN ('knex_migrations', 'knex_migrations_lock')
      AND pg_get_serial_sequence(t.tablename::text, 'id') IS NOT NULL
    `)

    for (const row of result.rows) {
      if (row.sequence_name) {
        sequences.set(row.table_name, row.sequence_name)
      }
    }

    return sequences
  }

  private async getBooleanColumns(tableName: string): Promise<Set<string>> {
    const result = await this.targetDb.raw(
      `
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = ? 
      AND table_schema = current_schema() 
      AND data_type = 'boolean'
    `,
      [tableName],
    )

    return new Set(
      result.rows.map((row: { column_name: string }) => row.column_name),
    )
  }

  private transformRow(
    row: Record<string, unknown>,
    booleanColumns: Set<string>,
  ): Record<string, unknown> {
    const transformed = { ...row }

    // SQLite stores booleans as 0/1, convert based on PG schema
    for (const [key, value] of Object.entries(transformed)) {
      if (booleanColumns.has(key)) {
        if (value === 0 || value === 1) {
          transformed[key] = value === 1
        } else if (value === '0' || value === '1') {
          transformed[key] = value === '1'
        } else if (value === 'true' || value === 'false') {
          transformed[key] = value === 'true'
        }
      } else if (value && typeof value === 'object') {
        if (
          value instanceof Date ||
          value instanceof Buffer ||
          value instanceof Uint8Array ||
          ArrayBuffer.isView(value)
        ) {
          transformed[key] = value
        } else {
          transformed[key] = JSON.stringify(value)
        }
      }
    }

    return transformed
  }

  async migrateTable(
    trx: Knex.Transaction,
    tableName: string,
  ): Promise<number> {
    try {
      const [{ count }] = await this.sourceDb(tableName).count('* as count')
      const totalRows = Number(count)

      if (totalRows === 0) {
        return 0
      }

      const booleanColumns = await this.getBooleanColumns(tableName)

      if (this.config.verbose && booleanColumns.size > 0) {
        this.log(
          `  ${tableName}: Found ${booleanColumns.size} boolean columns: ${Array.from(booleanColumns).join(', ')}`,
        )
      }

      let migrated = 0
      let offset = 0

      while (offset < totalRows) {
        const batch = await this.sourceDb(tableName)
          .select('*')
          .orderBy('rowid')
          .limit(this.config.batchSize)
          .offset(offset)

        if (batch.length === 0) break

        const transformedBatch = batch.map((row) =>
          this.transformRow(row, booleanColumns),
        )

        try {
          await trx(tableName).insert(transformedBatch)
        } catch (error) {
          throw new Error(
            `rows ${offset + 1}-${offset + batch.length} were rejected. ${driverMessage(error)}`,
          )
        }

        migrated += batch.length
        offset += this.config.batchSize

        if (this.config.verbose && totalRows > this.config.batchSize) {
          this.log(
            `  ${tableName}: ${migrated}/${totalRows} rows (${Math.round((migrated / totalRows) * 100)}%)`,
          )
        }
      }

      return migrated
    } catch (error) {
      throw new Error(`Failed to migrate ${tableName}`, { cause: error })
    }
  }

  async createBackup(): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const backupDir = resolveBackupDir()
    const backupPath = resolve(backupDir, `pulsarr-backup-${timestamp}.db`)

    this.log('Creating SQLite backup...')

    await fs.mkdir(backupDir, { recursive: true })
    await fs.copyFile(this.config.sqlitePath, backupPath)

    this.log(`Backup created at: ${backupPath}`)
    return backupPath
  }

  async migrate(): Promise<void> {
    try {
      this.log('Starting SQLite to PostgreSQL migration...')

      await this.verifyConnections()

      const tables = await this.getTables()
      if (tables.length === 0) {
        throw new Error(
          `No tables found in the SQLite database at ${this.config.sqlitePath}`,
        )
      }
      this.log(`Found ${tables.length} tables to migrate`)

      await assertUnusedTarget(this.targetDb)

      const orderedTables = await this.determineMigrationOrder(tables)
      const sequences = await this.getSequences()
      const backupPath = await this.createBackup()

      const proceed = await this.prompt(
        `\nThis will migrate all data from SQLite to PostgreSQL. The default rows the setup step created in PostgreSQL will be replaced.\nTables to migrate: ${orderedTables.length}\nBackup created at: ${backupPath}\nDo you want to proceed?`,
      )

      if (!proceed) {
        this.log('Migration cancelled by user')
        return
      }

      let totalMigrated = 0

      await this.targetDb.transaction(async (trx) => {
        // SQLite CURRENT_TIMESTAMP values are UTC with no zone suffix
        await trx.raw("SET LOCAL TIME ZONE 'UTC'")
        await trx.raw('LOCK TABLE configs IN ACCESS EXCLUSIVE MODE')
        await assertUnusedTarget(trx)
        const targetTables: string[] = await trx('pg_tables')
          .where('schemaname', 'public')
          .whereIn('tablename', orderedTables)
          .pluck('tablename')
        if (targetTables.length > 0) {
          await trx.raw(
            `TRUNCATE ${targetTables.map(() => '??').join(', ')} RESTART IDENTITY CASCADE`,
            targetTables,
          )
        }

        for (const table of orderedTables) {
          this.log(`Migrating ${table}...`)
          const count = await this.migrateTable(trx, table)
          totalMigrated += count
          this.log(`${table}: ${count} rows`)
        }

        for (const [table, sequence] of sequences) {
          const result = await trx(table).max('id as max_id')
          const maxId = result[0]?.max_id

          if (maxId) {
            await trx.raw('SELECT setval(?, ?)', [sequence, maxId])
          }
        }

        this.log('\nVerifying migration...')

        for (const table of orderedTables) {
          const [sourceCount] = await this.sourceDb(table).count('* as count')
          const [targetCount] = await trx(table).count('* as count')

          if (Number(sourceCount.count) !== Number(targetCount.count)) {
            throw new Error(
              `Row count mismatch in ${table}. Source has ${sourceCount.count}, target has ${targetCount.count}.`,
            )
          }
        }
      })

      this.log('All row counts match')
      this.log(
        `\nMigration complete! Migrated ${totalMigrated} total rows across ${orderedTables.length} tables.`,
      )
      this.log('\nNext steps:')
      this.log('1. Start Pulsarr')
      this.log(
        `2. Keep the backup at ${backupPath} until you have checked everything works`,
      )
    } catch (error) {
      this.log(`Migration failed. ${describeError(error)}`, 'error')
      throw error
    } finally {
      await this.cleanup()
    }
  }

  async cleanup(): Promise<void> {
    await this.sourceDb.destroy()
    await this.targetDb.destroy()
  }
}

async function main() {
  const args = process.argv.slice(2)
  const verbose = args.includes('--verbose') || args.includes('-v')
  const batchSize = Number.parseInt(
    args.find((arg) => arg.startsWith('--batch-size='))?.split('=')[1] ||
      '1000',
    10,
  )

  if (Number.isNaN(batchSize) || batchSize <= 0) {
    console.error('Error: Batch size must be a positive integer')
    process.exit(1)
  }

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
SQLite to PostgreSQL Migration Script

Usage: bun run migrate:sqlite-to-postgres [OPTIONS]

Options:
  --verbose, -v      Enable verbose output
  --batch-size=N     Set batch size (default: 1000)
  --help, -h         Show this help message

Prerequisites:
  1. PostgreSQL database created and migrations run
  2. Proper connection settings in .env file
`)
    process.exit(0)
  }

  const sqliteConnection = getSqliteConnection()
  const config: MigrationConfig = {
    source: {
      client: 'better-sqlite3',
      connection: sqliteConnection,
      useNullAsDefault: true,
    },
    target: {
      client: 'pg',
      connection: getPostgresConnection(),
    },
    sqlitePath: sqliteConnection.filename,
    batchSize,
    verbose,
  }

  const migration = new SQLiteToPostgresMigration(config)

  try {
    await migration.migrate()
    process.exit(0)
  } catch {
    process.exit(1)
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main()
}

export { type MigrationConfig, SQLiteToPostgresMigration }
