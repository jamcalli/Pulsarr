/** Like Promise.all, but waits for every promise to settle before rethrowing the first rejection in input order. */
export async function allSettledOrThrow<T extends readonly unknown[] | []>(
  promises: T,
): Promise<{ -readonly [K in keyof T]: Awaited<T[K]> }> {
  for (const result of await Promise.allSettled(promises)) {
    if (result.status === 'rejected') throw result.reason
  }
  return Promise.all(promises)
}
