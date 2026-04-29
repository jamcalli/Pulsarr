/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest'
import type { z } from 'zod'

// Zod's .partial() makes fields optional but does not strip .default() values,
// so a PATCH that omits a field gets the schema default silently injected and
// persisted, overwriting whatever was on the row.

type AnySchema = z.ZodType<unknown>

// Glob (not explicit imports) so any new Update*Schema is auto-covered.
const modules = import.meta.glob<Record<string, unknown>>(
  '../../../src/schemas/**/*.ts',
  { eager: true },
)

const isZodSchema = (value: unknown): value is AnySchema =>
  typeof value === 'object' &&
  value !== null &&
  'safeParse' in value &&
  typeof (value as { safeParse: unknown }).safeParse === 'function'

// Response schemas are output shapes, not request bodies; leakage doesn't apply.
const isUpdateSchemaName = (name: string): boolean =>
  /Update/.test(name) && /Schema$/.test(name) && !/Response/.test(name)

const updateSchemas: Array<{ name: string; file: string; schema: AnySchema }> =
  Object.entries(modules).flatMap(([file, mod]) =>
    Object.entries(mod)
      .filter(([name, value]) => isUpdateSchemaName(name) && isZodSchema(value))
      .map(([name, value]) => ({
        name,
        file: file.replace('../../../src/schemas/', ''),
        schema: value as AnySchema,
      })),
  )

describe('Update schemas: no default leakage on partial input', () => {
  it('discovers at least one update schema', () => {
    expect(updateSchemas.length).toBeGreaterThan(0)
  })

  it.each(
    updateSchemas,
  )('$name ($file) parse({}) returns no auto-injected keys', ({ schema }) => {
    const result = schema.safeParse({})
    if (result.success) {
      expect(result.data).toEqual({})
    } else {
      expect(result.error).toBeDefined()
    }
  })
})
