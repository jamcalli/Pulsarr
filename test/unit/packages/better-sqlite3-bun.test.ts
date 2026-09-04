import { existsSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

interface ShimStatement {
  reader: boolean
  run(...params: unknown[]): {
    changes: number
    lastInsertRowid: number | bigint
  }
  get(...params: unknown[]): unknown
  all(...params: unknown[]): unknown[]
  bind(...params: unknown[]): ShimStatement
  raw(toggle?: boolean): ShimStatement
}

interface ShimDatabase {
  prepare(sql: string): ShimStatement
  exec(sql: string): ShimDatabase
  close(): ShimDatabase
}

interface ShimDatabaseConstructor {
  new (
    path: string,
    options?: {
      readonly?: boolean
      fileMustExist?: boolean
      timeout?: number
    },
  ): ShimDatabase
}

// Not a static import - that would pull bun:sqlite types this tsconfig lacks
const require = createRequire(import.meta.url)
const Database =
  require('../../../packages/better-sqlite3-bun/index.js') as ShimDatabaseConstructor

describe('better-sqlite3-bun shim', () => {
  const tempFiles: string[] = []

  const tempPath = () => {
    const p = join(tmpdir(), `shim-test-${process.pid}-${tempFiles.length}.db`)
    tempFiles.push(p)
    return p
  }

  afterEach(() => {
    for (const p of tempFiles.splice(0)) {
      for (const suffix of ['', '-wal', '-shm']) {
        if (existsSync(p + suffix)) rmSync(p + suffix)
      }
    }
  })

  describe('constructor', () => {
    it('defaults busy_timeout to 5000 like better-sqlite3', () => {
      const db = new Database(':memory:')
      expect(db.prepare('PRAGMA busy_timeout').get()).toEqual({ timeout: 5000 })
      db.close()
    })

    it('applies an explicit timeout option', () => {
      const db = new Database(':memory:', { timeout: 250 })
      expect(db.prepare('PRAGMA busy_timeout').get()).toEqual({ timeout: 250 })
      db.close()
    })

    it('rejects invalid timeout values', () => {
      expect(() => new Database(':memory:', { timeout: -1 })).toThrow(TypeError)
      expect(() => new Database(':memory:', { timeout: Number.NaN })).toThrow(
        TypeError,
      )
    })

    it('throws on a missing file when fileMustExist is set', () => {
      expect(() => new Database(tempPath(), { fileMustExist: true })).toThrow()
    })

    it('does not create a missing file in readonly mode', () => {
      const p = tempPath()
      expect(() => new Database(p, { readonly: true })).toThrow()
      expect(existsSync(p)).toBe(false)
    })

    it('creates a missing file by default', () => {
      const p = tempPath()
      const db = new Database(p)
      db.exec('CREATE TABLE t (id INTEGER)')
      db.close()
      expect(existsSync(p)).toBe(true)
    })
  })

  describe('statement', () => {
    it('reports run() result shape and reader flag', () => {
      const db = new Database(':memory:')
      db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT)')
      const insert = db.prepare('INSERT INTO t (name) VALUES (?)')
      expect(insert.reader).toBe(false)

      const result = insert.run('a')
      expect(result.changes).toBe(1)
      expect(result.lastInsertRowid).toBe(1)

      const select = db.prepare('SELECT * FROM t')
      expect(select.reader).toBe(true)
      db.close()
    })

    it('bind() locks parameters in place', () => {
      const db = new Database(':memory:')
      const stmt = db.prepare('SELECT ? as a').bind(7)
      expect(stmt.get()).toEqual({ a: 7 })
      db.close()
    })

    it('bind() throws when invoked twice', () => {
      const db = new Database(':memory:')
      const stmt = db.prepare('SELECT ? as a').bind(7)
      expect(() => stmt.bind(8)).toThrow(TypeError)
      db.close()
    })

    it('throws when params are passed after bind()', () => {
      const db = new Database(':memory:')
      const stmt = db.prepare('SELECT ? as a').bind(7)
      expect(() => stmt.get(8)).toThrow(TypeError)
      expect(() => stmt.all(8)).toThrow(TypeError)
      db.close()
    })

    it('raw() mutates the statement in place', () => {
      const db = new Database(':memory:')
      const stmt = db.prepare('SELECT 1 as a, 2 as b')
      stmt.raw()
      expect(stmt.all()).toEqual([[1, 2]])
      expect(stmt.get()).toEqual([1, 2])
      stmt.raw(false)
      expect(stmt.get()).toEqual({ a: 1, b: 2 })
      db.close()
    })
  })

  describe('database', () => {
    it('exec() and close() are chainable', () => {
      const db = new Database(':memory:')
      expect(db.exec('CREATE TABLE t (id INTEGER)')).toBe(db)
      expect(db.close()).toBe(db)
    })
  })
})
