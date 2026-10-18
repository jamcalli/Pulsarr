/** A bulk outcome merged across chunked requests, `failed` holding create keys or remove ids. */
export interface ExclusionOutcome<Failed extends string | number> {
  total: number
  failed: Failed[]
  errors: string[]
}

/** Splits items so each chunk holds at most `max` item and user pairs, an item with more users than `max` going out in parts. */
export function chunkExclusions<T extends { userIds: number[] }>(
  items: readonly T[],
  max: number,
): T[][] {
  const chunks: T[][] = []
  let current: T[] = []
  let size = 0
  for (const item of items) {
    let rest = item.userIds
    while (rest.length > 0) {
      if (size === max) {
        chunks.push(current)
        current = []
        size = 0
      }
      const part = rest.slice(0, max - size)
      rest = rest.slice(part.length)
      current.push({ ...item, userIds: part })
      size += part.length
    }
  }
  if (current.length > 0) chunks.push(current)
  return chunks
}

export function chunkIds(ids: readonly number[], max: number): number[][] {
  const chunks: number[][] = []
  for (let start = 0; start < ids.length; start += max) {
    chunks.push(ids.slice(start, start + max))
  }
  return chunks
}

export function mergeOutcomes<Failed extends string | number>(
  outcomes: ReadonlyArray<ExclusionOutcome<Failed>>,
): ExclusionOutcome<Failed> {
  return {
    total: outcomes.reduce((sum, outcome) => sum + outcome.total, 0),
    failed: [...new Set(outcomes.flatMap((outcome) => outcome.failed))],
    errors: outcomes.flatMap((outcome) => outcome.errors),
  }
}
