import type { paths } from '@/types/api.js'

type UpdateStatus =
  paths['/v1/system/update-status']['get']['responses'][200]['content']['application/json']

export interface AvailableUpdate {
  latestVersion: string
  releaseUrl: string
  releaseBodyHtml: string | null
  publishedAt: string | null
}

const PENDING_POLL_MS = 5 * 1000
const IDLE_POLL_MS = 15 * 60 * 1000

/** The server checks GitHub hourly and its boot check runs detached, so poll fast only while it reports `pending`. */
export function updatePollInterval(status: UpdateStatus | undefined): number {
  return status?.status === 'pending' ? PENDING_POLL_MS : IDLE_POLL_MS
}

/** Null unless the server reports a newer version with a release link to show. */
export function availableUpdate(
  status: UpdateStatus | undefined,
): AvailableUpdate | null {
  if (!status?.updateAvailable || !status.latestVersion || !status.releaseUrl) {
    return null
  }
  return {
    latestVersion: status.latestVersion,
    releaseUrl: status.releaseUrl,
    releaseBodyHtml: status.releaseBodyHtml,
    publishedAt: status.publishedAt,
  }
}
