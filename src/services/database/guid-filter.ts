import { normalizeGuid } from '@utils/guid-handler.js'
import type { Knex } from 'knex'

/** Matches rows whose JSON guid array in `column` holds any of `guids` after normalizing them, using the Postgres GIN index. */
export function whereGuidsContainAny<TRecord extends object, TResult>(
  query: Knex.QueryBuilder<TRecord, TResult>,
  column: Extract<keyof Knex.ResolveTableType<TRecord>, string>,
  guids: string[],
  isPostgres: boolean,
): Knex.QueryBuilder<TRecord, TResult> {
  const normalized = [...new Set(guids.map(normalizeGuid))]
  if (normalized.length === 0) return query.whereRaw('1 = 0')

  // Knex has no builder for ?|, and ORed whereJsonSupersetOf calls skip the GIN index
  if (isPostgres) {
    return query.whereRaw('?? \\?| ?::text[]', [column, normalized])
  }

  const placeholders = normalized.map(() => '?').join(', ')
  return query.whereRaw(
    `EXISTS (SELECT 1 FROM json_each(??) WHERE json_each.value IN (${placeholders}))`,
    [column, ...normalized],
  )
}
