import { Database as BunDatabase } from 'bun:sqlite'

interface DatabaseOptions {
  readonly?: boolean
  fileMustExist?: boolean
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
  private rawMode = false

  constructor(
    stmt: ReturnType<BunDatabase['prepare']>,
    verbose?: (sql: string) => void,
  ) {
    this.stmt = stmt
    this.verbose = verbose
  }

  get reader(): boolean {
    return this.stmt.columnNames.length > 0
  }

  // better-sqlite3 treats params passed after bind() as an error
  private resolveParams(params: unknown[]): unknown[] {
    if (this.boundParams) {
      if (params.length > 0) {
        throw new TypeError('This statement already has bound parameters')
      }
      return this.boundParams
    }
    return params
  }

  run(...params: unknown[]): RunResult {
    if (this.verbose) {
      this.verbose(this.stmt.toString())
    }
    const finalParams = this.resolveParams(params)
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
    const finalParams = this.resolveParams(params)
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
    const finalParams = this.resolveParams(params)
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
    const finalParams = this.resolveParams(params)
    if (this.rawMode) {
      // Bun has no streaming API for arrays - must buffer
      const results = this.stmt.values(...finalParams) as unknown[][]
      for (const row of results) {
        yield row
      }
    } else {
      // Use native streaming iterator
      yield* this.stmt.iterate(...finalParams) as IterableIterator<
        Record<string, unknown>
      >
    }
  }

  bind(...params: unknown[]): this {
    if (this.boundParams) {
      throw new TypeError(
        'The bind() method can only be invoked once per statement object',
      )
    }
    this.boundParams = params
    return this
  }

  raw(toggle = true): this {
    this.rawMode = toggle !== false
    return this
  }

  safeIntegers(toggle = true): this {
    this.stmt.safeIntegers(toggle !== false)
    return this
  }
}

class Database {
  private db: BunDatabase
  private verbose?: (sql: string) => void
  private safeIntegersDefault = false

  constructor(path: string, options: DatabaseOptions = {}) {
    // better-sqlite3 defaults to a 5s busy timeout; Bun's constructor has
    // no timeout option and its busy_timeout default is 0
    const timeout = options.timeout ?? 5000
    if (!Number.isFinite(timeout) || timeout < 0) {
      throw new TypeError('timeout must be a non-negative finite number')
    }

    this.db = new BunDatabase(path, {
      readwrite: !options.readonly,
      readonly: options.readonly,
      // better-sqlite3 never creates in readonly mode and throws on a
      // missing file when fileMustExist is set
      create: !options.readonly && !options.fileMustExist,
    })
    this.verbose = options.verbose

    this.db.exec(`PRAGMA busy_timeout = ${timeout}`)
  }

  prepare(sql: string): Statement {
    const stmt = this.db.prepare(sql)
    if (this.safeIntegersDefault) {
      stmt.safeIntegers(true)
    }
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

  defaultSafeIntegers(toggle = true): this {
    this.safeIntegersDefault = toggle !== false
    return this
  }
}

export default Database
export { Database }
