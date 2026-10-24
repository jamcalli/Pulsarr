import type { ProgressEvent } from '@root/types/progress.types.js'

/** Null until the progress stream has reported one of `statuses`. */
export function systemStatusFrom<Status extends string>(
  event: ProgressEvent | undefined,
  statuses: readonly Status[],
): Status | null {
  const metadata = event?.metadata
  if (!metadata || !('status' in metadata)) return null
  return statuses.find((status) => status === metadata.status) ?? null
}
