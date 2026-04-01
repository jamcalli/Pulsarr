import fs from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import readline from 'node:readline'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import knex, { type Knex } from 'knex'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const projectRoot = resolve(__dirname, '..', '..')

dotenv.config({ path: resolve(projectRoot, '.env'), quiet: true })

interface MigrationConfig {
  source: Knex.Config
  target: Knex.Config
  batchSize: number
  verbose: boolean
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
    const prefix = {
      info: '✓',
      warn: '⚠',
      error: '✗',
    }[level]

    console.log(`[${timestamp}] ${prefix} ${message}`)
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
      this.log(`Connection error details: ${error}`)
      throw new Error(
        `Database connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      )
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

  async migrateTable(tableName: string): Promise<number> {
    try {
      // Fail-fast: target must be empty (fresh PG install only)
      const [{ count: targetCount }] =
        await this.targetDb(tableName).count('* as count')
      if (Number(targetCount) > 0) {
        throw new Error(
          `Target table ${tableName} is not empty (${targetCount} rows). ` +
            'This migration is designed for fresh PostgreSQL installations only. ' +
            'Please ensure you have a clean PostgreSQL database with only schema (no data).',
        )
      }

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
          .limit(this.config.batchSize)
          .offset(offset)

        if (batch.length === 0) break

        const transformedBatch = batch.map((row) =>
          this.transformRow(row, booleanColumns),
        )

        await this.targetDb(tableName).insert(transformedBatch)

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
      throw new Error(`Failed to migrate ${tableName}: ${error}`)
    }
  }

  async createBackup(): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const backupPath = resolve(
      projectRoot,
      `data/backups/pulsarr-backup-${timestamp}.db`,
    )

    this.log('Creating SQLite backup...')

    await fs.mkdir(resolve(projectRoot, 'data/backups'), { recursive: true })

    const connection = this.config.source.connection
    const sourcePath =
      typeof connection === 'object' && connection && 'filename' in connection
        ? (connection.filename as string)
        : resolve(projectRoot, 'data/db/pulsarr.db')
    await fs.copyFile(sourcePath, backupPath)

    this.log(`Backup created at: ${backupPath}`)
    return backupPath
  }

  async migrate(): Promise<void> {
    try {
      this.log('Starting SQLite to PostgreSQL migration...')

      await this.verifyConnections()

      const tables = await this.getTables()
      this.log(`Found ${tables.length} tables to migrate`)

      const orderedTables = await this.determineMigrationOrder(tables)
      const sequences = await this.getSequences()
      const backupPath = await this.createBackup()

      const proceed = await this.prompt(
        `\nThis will migrate all data from SQLite to PostgreSQL.\nTables to migrate: ${orderedTables.length}\nBackup created at: ${backupPath}\nDo you want to proceed?`,
      )

      if (!proceed) {
        this.log('Migration cancelled by user')
        return
      }

      const stats: { [table: string]: number } = {}
      let totalMigrated = 0

      for (const table of orderedTables) {
        this.log(`Migrating ${table}...`)
        const count = await this.migrateTable(table)
        stats[table] = count
        totalMigrated += count
        this.log(`✓ ${table}: ${count} rows`)
      }

      // Reset PG sequences to match migrated max IDs
      for (const [table, sequence] of sequences) {
        const result = await this.targetDb(table).max('id as max_id')
        const maxId = result[0]?.max_id

        if (maxId) {
          await this.targetDb.raw('SELECT setval(?, ?)', [sequence, maxId])
        }
      }

      this.log('\nVerifying migration...')
      let allMatch = true

      for (const table of orderedTables) {
        const [sourceCount] = await this.sourceDb(table).count('* as count')
        const [targetCount] = await this.targetDb(table).count('* as count')

        if (Number(sourceCount.count) !== Number(targetCount.count)) {
          this.log(
            `${table}: count mismatch! Source: ${sourceCount.count}, Target: ${targetCount.count}`,
            'warn',
          )
          allMatch = false
        }
      }

      if (allMatch) {
        this.log('✓ All row counts match!')
      }

      this.log(
        `\nMigration complete! Migrated ${totalMigrated} total rows across ${orderedTables.length} tables.`,
      )
      this.log('\nNext steps:')
      this.log('1. Update your .env file to use PostgreSQL settings')
      this.log('2. Set dbType=postgres')
      this.log('3. Restart your application')
      this.log(
        `4. Keep the backup at ${backupPath} until you verify everything works`,
      )
    } catch (error) {
      this.log(`Migration failed: ${error}`, 'error')
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

Usage: bun migrate-to-postgres.ts [OPTIONS]

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

  const config: MigrationConfig = {
    source: {
      client: 'better-sqlite3',
      connection: {
        filename:
          process.env.dbPath || resolve(projectRoot, 'data/db/pulsarr.db'),
      },
      useNullAsDefault: true,
    },
    target: {
      client: 'pg',
      connection: process.env.dbConnectionString || {
        host: process.env.dbHost || 'localhost',
        port: Number.parseInt(process.env.dbPort || '5432', 10),
        user: process.env.dbUser || 'postgres',
        password: process.env.dbPassword || '',
        database: process.env.dbName || 'pulsarr',
      },
    },
    batchSize,
    verbose,
  }

  const migration = new SQLiteToPostgresMigration(config)

  try {
    await migration.migrate()
    process.exit(0)
  } catch (error) {
    console.error('Migration failed:', error)
    process.exit(1)
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main()
}

export { type MigrationConfig, SQLiteToPostgresMigration }
