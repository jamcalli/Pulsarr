import type { Knex } from 'knex'

/** Sorts by `column` with NULLs last in both directions, since SQLite and Postgres default to opposite null placement. */
export function orderNullsLast<TRecord extends object, TResult>(
  query: Knex.QueryBuilder<TRecord, TResult>,
  column: string,
  direction: 'asc' | 'desc',
): Knex.QueryBuilder<TRecord, TResult> {
  return query
    .orderByRaw('CASE WHEN ?? IS NULL THEN 1 ELSE 0 END', [column])
    .orderBy(column, direction)
}

/** Sorts `column` by its text, because Postgres orders enum columns by declaration order and SQLite by text. */
export function orderAsText<TRecord extends object, TResult>(
  query: Knex.QueryBuilder<TRecord, TResult>,
  column: string,
): Knex.QueryBuilder<TRecord, TResult> {
  return query.orderByRaw('CAST(?? AS TEXT)', [column])
}
