import { Database as BunDatabase } from 'bun:sqlite'

interface DatabaseOptions {
  readonly?: boolean
  timeout?: number
  verbose?: (sql: string) => void
}

interface RunResult {
  changes: number
  lastInsertRowid: number | bigint
}

class Statement {
  private stmt: ReturnType<BunDatabase['prepare']>
  private verbose?: (sql: string) => void
  private boundParams?: unknown[]
  private rawMode: boolean

  constructor(
    stmt: ReturnType<BunDatabase['prepare']>,
    verbose?: (sql: string) => void,
    boundParams?: unknown[],
    rawMode = false,
  ) {
    this.stmt = stmt
    this.verbose = verbose
    this.boundParams = boundParams
    this.rawMode = rawMode
  }

  get reader(): boolean {
    return this.stmt.columnNames.length > 0
  }

  run(...params: unknown[]): RunResult {
    if (this.verbose) {
      this.verbose(this.stmt.toString())
    }
    const finalParams = this.boundParams || params
    const result = this.stmt.run(...finalParams)
    return {
      changes: result.changes,
      lastInsertRowid: result.lastInsertRowid,
    }
  }

  get(...params: unknown[]): Record<string, unknown> | unknown[] | undefined {
    if (this.verbose) {
      this.verbose(this.stmt.toString())
    }
    const finalParams = this.boundParams || params
    if (this.rawMode) {
      const results = this.stmt.values(...finalParams) as unknown[][]
      return results[0]
    }
    return this.stmt.get(...finalParams) as Record<string, unknown> | undefined
  }

  all(...params: unknown[]): Record<string, unknown>[] | unknown[][] {
    if (this.verbose) {
      this.verbose(this.stmt.toString())
    }
    const finalParams = this.boundParams || params
    if (this.rawMode) {
      return this.stmt.values(...finalParams) as unknown[][]
    }
    return this.stmt.all(...finalParams) as Record<string, unknown>[]
  }

  *iterate(
    ...params: unknown[]
  ): IterableIterator<Record<string, unknown> | unknown[]> {
    if (this.verbose) {
      this.verbose(this.stmt.toString())
    }
    const finalParams = this.boundParams || params
    if (this.rawMode) {
      const results = this.stmt.values(...finalParams) as unknown[][]
      for (const row of results) {
        yield row
      }
    } else {
      const results = this.stmt.all(...finalParams) as Record<string, unknown>[]
      for (const row of results) {
        yield row
      }
    }
  }

  bind(...params: unknown[]): Statement {
    return new Statement(this.stmt, this.verbose, params, this.rawMode)
  }

  raw(enabled = true): Statement {
    return new Statement(this.stmt, this.verbose, this.boundParams, enabled)
  }
}

class Database {
  private db: BunDatabase
  private verbose?: (sql: string) => void

  constructor(path: string, options: DatabaseOptions = {}) {
    this.db = new BunDatabase(path, {
      readwrite: !options.readonly,
      readonly: options.readonly,
      create: true,
    })
    this.verbose = options.verbose

    // Apply busy timeout via PRAGMA (Bun's constructor doesn't support timeout directly)
    if (options.timeout !== undefined) {
      if (!Number.isFinite(options.timeout) || options.timeout < 0) {
        throw new TypeError('timeout must be a non-negative finite number')
      }
      this.db.exec(`PRAGMA busy_timeout = ${options.timeout}`)
    }
  }

  prepare(sql: string): Statement {
    const stmt = this.db.prepare(sql)
    return new Statement(stmt, this.verbose)
  }

  exec(sql: string): this {
    if (this.verbose) {
      this.verbose(sql)
    }
    this.db.exec(sql)
    return this
  }

  close(): this {
    this.db.close()
    return this
  }

  transaction<T extends (...args: unknown[]) => unknown>(fn: T): T {
    return this.db.transaction(fn) as unknown as T
  }
}

export default Database
export { Database }
