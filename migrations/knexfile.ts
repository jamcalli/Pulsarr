import fs from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import dotenv from 'dotenv'
import type { Knex } from 'knex'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const projectRoot = resolve(__dirname, '..')

// Inlined from src/utils/data-dir.ts — migrations must be self-contained
// because Docker only copies migrations/, not src/
function resolveDataDir(): string | null {
  if (process.env.dataDir) return process.env.dataDir
  if (process.platform === 'win32') {
    const programData = process.env.PROGRAMDATA || process.env.ALLUSERSPROFILE
    if (programData) return resolve(programData, 'Pulsarr')
  }
  if (process.platform === 'darwin') {
    const home = process.env.HOME
    if (home) return resolve(home, '.config', 'Pulsarr')
  }
  return null
}

function resolveDbPath(root: string): string {
  const dir = resolveDataDir()
  return dir ? resolve(dir, 'db') : resolve(root, 'data', 'db')
}

function resolveEnvPath(root: string): string {
  const dir = resolveDataDir()
  return dir ? resolve(dir, '.env') : resolve(root, '.env')
}

// Resolve data directory deterministically from platform (Windows/macOS)
// or fall back to project-relative paths (Linux/Docker)
const dataDir = resolveDataDir()

// Load environment variables before anything else
dotenv.config({
  path: resolveEnvPath(projectRoot),
  quiet: true,
})

// SQLite file suffixes that must be moved together
const SQLITE_SUFFIXES = ['', '-wal', '-shm', '-journal']

/**
 * Renames a file, falling back to copy + unlink when source and destination
 * are on different filesystems (EXDEV).
 */
function moveFile(src: string, dst: string): void {
  try {
    fs.renameSync(src, dst)
  } catch (err) {
    if (err instanceof Error && 'code' in err && err.code === 'EXDEV') {
      fs.copyFileSync(src, dst)
      fs.unlinkSync(src)
    } else {
      throw err
    }
  }
}

/**
 * Moves SQLite database files (main db + WAL/SHM/journal) from one directory to another.
 */
function moveSqliteFiles(fromDir: string, toDir: string): void {
  for (const suffix of SQLITE_SUFFIXES) {
    const src = resolve(fromDir, `pulsarr.db${suffix}`)
    const dst = resolve(toDir, `pulsarr.db${suffix}`)
    if (fs.existsSync(src)) {
      moveFile(src, dst)
    }
  }
}

/**
 * Removes SQLite database files from a directory.
 */
function removeSqliteFiles(dir: string): void {
  for (const suffix of SQLITE_SUFFIXES) {
    const file = resolve(dir, `pulsarr.db${suffix}`)
    if (fs.existsSync(file)) {
      fs.unlinkSync(file)
    }
  }
}

/**
 * Opens a SQLite database read-only and queries basic richness indicators.
 * Returns null if the database can't be read or lacks expected tables.
 *
 * Callers must verify the file exists before calling — the Bun shim for
 * better-sqlite3 does not support fileMustExist and will create an empty file.
 */
function queryDbRichness(
  dbPath: string,
): { isReady: boolean; userCount: number } | null {
  try {
    const db = new Database(dbPath, { readonly: true })
    try {
      const configRow = db
        .prepare('SELECT "_isReady" FROM configs WHERE id = 1')
        .get() as { _isReady: number | boolean } | undefined
      const countRow = db
        .prepare('SELECT COUNT(*) as count FROM users')
        .get() as { count: number } | undefined
      return {
        isReady: configRow ? Boolean(configRow._isReady) : false,
        userCount: countRow?.count ?? 0,
      }
    } finally {
      db.close()
    }
  } catch {
    return null
  }
}

/**
 * One-time recovery for databases created at the wrong path due to the
 * Inno Setup execution ordering bug (dataDir env var not set on first service start).
 *
 * Only runs when:
 * - Platform has a resolved data dir (Windows/macOS installer)
 * - Database type is SQLite
 * - Marker file doesn't exist yet (ensures one-time execution)
 * - The correct and alt paths are actually different
 *
 * Cases:
 * A) Only alt path has DB → move to correct path
 * B) Only correct path has DB → nothing to do
 * C) Both paths have DBs → compare richness, prefer the one with real data
 * D) Neither path has DB → fresh install, nothing to do
 */
function recoverMisplacedDatabase(
  resolvedDataDir: string,
  correctDbDir: string,
): void {
  const markerPath = resolve(resolvedDataDir, '.db-path-migrated')

  // Already ran recovery
  if (fs.existsSync(markerPath)) return

  const altDbDir = resolve(projectRoot, 'data', 'db')

  // Skip if paths resolve to the same location
  if (resolve(correctDbDir) === resolve(altDbDir)) {
    writeMarker(markerPath)
    return
  }

  const correctDb = resolve(correctDbDir, 'pulsarr.db')
  const altDb = resolve(altDbDir, 'pulsarr.db')
  const correctExists = fs.existsSync(correctDb)
  const altExists = fs.existsSync(altDb)

  if (!correctExists && altExists) {
    // Case A: Only alt path has DB — move it to the correct location
    fs.mkdirSync(correctDbDir, { recursive: true })
    moveSqliteFiles(altDbDir, correctDbDir)
    console.log(
      `[DB Recovery] Moved database from ${altDbDir} to ${correctDbDir}`,
    )
  } else if (correctExists && altExists) {
    // Case C: Both paths have DBs — compare and decide
    const correctInfo = queryDbRichness(correctDb)
    const altInfo = queryDbRichness(altDb)

    const correctIsFresh =
      correctInfo && !correctInfo.isReady && correctInfo.userCount === 0
    const altHasData = altInfo && (altInfo.isReady || altInfo.userCount > 0)
    const altIsFresh = altInfo && !altInfo.isReady && altInfo.userCount === 0
    const correctHasData =
      correctInfo && (correctInfo.isReady || correctInfo.userCount > 0)

    if (correctIsFresh && altHasData) {
      // Current DB is a fresh re-setup, alt has the real data — swap
      // Back up all companion files to avoid orphaned WAL/SHM from the fresh DB
      for (const suffix of SQLITE_SUFFIXES) {
        const src = resolve(correctDbDir, `pulsarr.db${suffix}`)
        if (fs.existsSync(src)) {
          moveFile(src, resolve(correctDbDir, `pulsarr.db.bak${suffix}`))
        }
      }
      moveSqliteFiles(altDbDir, correctDbDir)
      console.log(
        `[DB Recovery] Replaced fresh database with recovered data from ${altDbDir}`,
      )
    } else if (altIsFresh && correctHasData) {
      // Alt is the empty one — clean it up
      removeSqliteFiles(altDbDir)
      console.log(`[DB Recovery] Cleaned up empty database at ${altDbDir}`)
    } else if (altHasData && correctHasData) {
      // Both have real data — don't touch either, warn the user
      console.warn(
        `[DB Recovery] WARNING: Found databases at two locations:\n` +
          `  Current: ${correctDb}\n` +
          `  Old:     ${altDb}\n` +
          `  Both contain data. Please check which one you need and remove the other.`,
      )
    }
  }
  // Cases B and D: nothing to do

  writeMarker(markerPath)
}

/**
 * Writes the one-time marker file, creating parent directories if needed.
 */
function writeMarker(markerPath: string): void {
  try {
    const dir = dirname(markerPath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    fs.writeFileSync(markerPath, new Date().toISOString(), 'utf-8')
  } catch {
    // Non-fatal — recovery will just re-run next time
  }
}

/**
 * Ensures that the database directory exists, creating it if necessary.
 * On installer platforms (Windows/macOS), runs one-time recovery for databases
 * that may have been created at the wrong path.
 *
 * @returns The absolute path to the database directory.
 * @remark If the directory cannot be created, the process will terminate with an error.
 */
function ensureDbDirectory() {
  const dbDirectory = resolveDbPath(projectRoot)

  // One-time database path recovery for installer platforms (SQLite only)
  if (dataDir && !isPostgres) {
    try {
      recoverMisplacedDatabase(dataDir, dbDirectory)
    } catch (err) {
      console.warn('[DB Recovery] Recovery check failed, continuing:', err)
    }
  }

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
  const port = Number.parseInt(process.env.dbPort || '5432', 10)
  if (Number.isNaN(port) || port < 1 || port > 65535) {
    throw new Error('Invalid database port number')
  }

  // Otherwise, build from individual components
  return {
    host: process.env.dbHost || 'localhost',
    port,
    user: process.env.dbUser || 'postgres',
    password: process.env.dbPassword || undefined,
    database: process.env.dbName || 'pulsarr',
  }
}

// Build SQLite connection configuration
const getSqliteConnection = () => ({
  filename: process.env.dbPath || resolve(ensureDbDirectory(), 'pulsarr.db'),
})

const config: { [key: string]: Knex.Config } = {
  development: {
    client: isPostgres ? 'pg' : 'better-sqlite3',
    connection: isPostgres ? getPostgresConnection() : getSqliteConnection(),
    useNullAsDefault: !isPostgres,
    migrations: {
      directory: resolve(__dirname, 'migrations'),
    },
    pool: isPostgres
      ? {
          min: 2,
          max: 10,
        }
      : {
          afterCreate: (conn: unknown, cb: () => void) => {
            // Type assertion for SQLite database connection
            const sqliteConn = conn as { exec: (sql: string) => void }
            sqliteConn.exec('PRAGMA journal_mode = WAL;')
            sqliteConn.exec('PRAGMA foreign_keys = ON;')
            cb()
          },
        },
  },
}

export default config
