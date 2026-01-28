import { Database as BunDatabase } from 'bun:sqlite'

interface DatabaseOptions {
  readonly?: boolean
  timeout?: number
  verbose?: (sql: string) => void
}

interface RunResult {
  changes: number
  lastInsertRowid: number
}

class Statement {
  private stmt: ReturnType<BunDatabase['prepare']>
  private verbose?: (sql: string) => void
  private boundParams?: unknown[]

  constructor(
    stmt: ReturnType<BunDatabase['prepare']>,
    verbose?: (sql: string) => void,
    boundParams?: unknown[],
  ) {
    this.stmt = stmt
    this.verbose = verbose
    this.boundParams = boundParams
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

  get(...params: unknown[]): Record<string, unknown> | undefined {
    if (this.verbose) {
      this.verbose(this.stmt.toString())
    }
    const finalParams = this.boundParams || params
    return this.stmt.get(...finalParams) as Record<string, unknown> | undefined
  }

  all(...params: unknown[]): Record<string, unknown>[] {
    if (this.verbose) {
      this.verbose(this.stmt.toString())
    }
    const finalParams = this.boundParams || params
    return this.stmt.all(...finalParams) as Record<string, unknown>[]
  }

  *iterate(...params: unknown[]): IterableIterator<Record<string, unknown>> {
    if (this.verbose) {
      this.verbose(this.stmt.toString())
    }
    const finalParams = this.boundParams || params
    const results = this.stmt.all(...finalParams) as Record<string, unknown>[]
    for (const row of results) {
      yield row
    }
  }

  bind(...params: unknown[]): Statement {
    return new Statement(this.stmt, this.verbose, params)
  }

  raw(): Statement {
    return this
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
