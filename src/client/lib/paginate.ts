/** Clamps `page` into range and returns that page's slice, for lists paged on the client. */
export function paginate<T>(
  items: readonly T[],
  page: number,
  pageSize: number,
): { page: number; rows: T[] } {
  const lastPage = Math.max(1, Math.ceil(items.length / pageSize))
  const current = Math.min(Math.max(1, page), lastPage)
  return {
    page: current,
    rows: items.slice((current - 1) * pageSize, current * pageSize),
  }
}
