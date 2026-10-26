import type { Knex } from 'knex'

function escapeLikePattern(search: string): string {
  return search.replace(/[%_\\]/g, '\\$&')
}

/** Case-insensitive partial match of `search` against `column` on both drivers, with LIKE wildcards escaped. */
export function applySearchFilter<TRecord extends object, TResult>(
  query: Knex.QueryBuilder<TRecord, TResult>,
  search: string,
  column: string,
  isPostgres: boolean,
): Knex.QueryBuilder<TRecord, TResult> {
  const operator = isPostgres ? 'ILIKE' : 'LIKE'
  return query.whereRaw(`?? ${operator} ? ESCAPE '\\'`, [
    column,
    `%${escapeLikePattern(search)}%`,
  ])
}
