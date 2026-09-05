import {
  Database as BunDatabase,
  type Statement as BunStatement,
  type SQLQueryBindings,
} from 'bun:sqlite'

type Row = Record<string, unknown>
type RawRow = ReturnType<
  BunStatement<Row, SQLQueryBindings[]>['values']
>[number]

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
  private stmt: BunStatement<Row, SQLQueryBindings[]>
  private verbose?: (sql: string) => void
  private boundParams?: SQLQueryBindings[]
  private rawMode = false

  constructor(
    stmt: BunStatement<Row, SQLQueryBindings[]>,
    verbose?: (sql: string) => void,
  ) {
    this.stmt = stmt
    this.verbose = verbose
  }

  get reader(): boolean {
    return this.stmt.columnNames.length > 0
  }

  // better-sqlite3 treats params passed after bind() as an error
  private resolveParams(params: SQLQueryBindings[]): SQLQueryBindings[] {
    if (this.boundParams) {
      if (params.length > 0) {
        throw new TypeError('This statement already has bound parameters')
      }
      return this.boundParams
    }
    return params
  }

  run(...params: SQLQueryBindings[]): RunResult {
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

  get(...params: SQLQueryBindings[]): Row | RawRow | undefined {
    if (this.verbose) {
      this.verbose(this.stmt.toString())
    }
    const finalParams = this.resolveParams(params)
    if (this.rawMode) {
      return this.stmt.values(...finalParams)[0]
    }
    return this.stmt.get(...finalParams) ?? undefined
  }

  all(...params: SQLQueryBindings[]): Row[] | RawRow[] {
    if (this.verbose) {
      this.verbose(this.stmt.toString())
    }
    const finalParams = this.resolveParams(params)
    if (this.rawMode) {
      return this.stmt.values(...finalParams)
    }
    return this.stmt.all(...finalParams)
  }

  *iterate(...params: SQLQueryBindings[]): IterableIterator<Row | RawRow> {
    if (this.verbose) {
      this.verbose(this.stmt.toString())
    }
    const finalParams = this.resolveParams(params)
    if (this.rawMode) {
      // Bun has no streaming API for arrays - must buffer
      yield* this.stmt.values(...finalParams)
    } else {
      yield* this.stmt.iterate(...finalParams)
    }
  }

  bind(...params: SQLQueryBindings[]): this {
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
}

class Database {
  private db: BunDatabase
  private verbose?: (sql: string) => void

  constructor(path: string, options: DatabaseOptions = {}) {
    // better-sqlite3 defaults busy_timeout to 5s; Bun's constructor has no timeout option and defaults it to 0
    const timeout = options.timeout ?? 5000
    if (!Number.isFinite(timeout) || timeout < 0) {
      throw new TypeError('timeout must be a non-negative finite number')
    }

    this.db = new BunDatabase(path, {
      readwrite: !options.readonly,
      readonly: options.readonly,
      // better-sqlite3 never creates in readonly mode and throws on a missing file when fileMustExist is set
      create: !options.readonly && !options.fileMustExist,
    })
    this.verbose = options.verbose

    this.db.run(`PRAGMA busy_timeout = ${timeout}`)
  }

  prepare(sql: string): Statement {
    const stmt = this.db.prepare<Row, SQLQueryBindings[]>(sql)
    return new Statement(stmt, this.verbose)
  }

  exec(sql: string): this {
    if (this.verbose) {
      this.verbose(sql)
    }
    this.db.run(sql)
    return this
  }

  close(): this {
    this.db.close()
    return this
  }

  transaction<A extends unknown[], T>(fn: (...args: A) => T) {
    return this.db.transaction(fn)
  }
}

export default Database
export { Database }
