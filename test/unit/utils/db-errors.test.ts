import { isUniqueViolation } from '@utils/db-errors.js'
import knex, { type Knex } from 'knex'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

describe('isUniqueViolation', () => {
  describe('better-sqlite3 (real driver errors)', () => {
    let db: Knex

    beforeAll(async () => {
      db = knex({
        client: 'better-sqlite3',
        connection: { filename: ':memory:' },
        useNullAsDefault: true,
      })
      await db.schema.createTable('things', (table) => {
        table.increments('id')
        table.string('name').unique()
        table.integer('amount').notNullable()
      })
      await db('things').insert({ name: 'taken', amount: 1 })
    })

    afterAll(async () => {
      await db.destroy()
    })

    it('detects a real unique violation', async () => {
      const error = await db('things')
        .insert({ name: 'taken', amount: 2 })
        .then(
          () => null,
          (e: unknown) => e,
        )
      expect(error).toBeInstanceOf(Error)
      expect(isUniqueViolation(error)).toBe(true)
    })

    it('rejects a not-null constraint error', async () => {
      const error = await db('things')
        .insert({ name: 'other', amount: null })
        .then(
          () => null,
          (e: unknown) => e,
        )
      expect(error).toBeInstanceOf(Error)
      expect(isUniqueViolation(error)).toBe(false)
    })
  })

  describe('postgres error shape (SQLSTATE codes)', () => {
    it('detects 23505 unique_violation', () => {
      const error = Object.assign(
        new Error(
          'duplicate key value violates unique constraint "users_name_unique"',
        ),
        { code: '23505', constraint: 'users_name_unique' },
      )
      expect(isUniqueViolation(error)).toBe(true)
    })

    it('rejects 23502 not_null_violation', () => {
      const error = Object.assign(
        new Error('null value in column "amount" violates not-null constraint'),
        { code: '23502' },
      )
      expect(isUniqueViolation(error)).toBe(false)
    })
  })

  it('rejects non-Error values', () => {
    expect(isUniqueViolation('UNIQUE constraint failed: things.name')).toBe(
      false,
    )
    expect(isUniqueViolation(null)).toBe(false)
    expect(isUniqueViolation(undefined)).toBe(false)
  })
})
