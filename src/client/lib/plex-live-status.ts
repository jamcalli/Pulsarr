import type { ProgressEvent } from '@root/types/progress.types.js'

export type PlexLiveStatus = 'connected' | 'disconnected'

/** Null until the progress stream has reported the Plex live connection. */
export function plexLiveStatusFrom(
  event: ProgressEvent | undefined,
): PlexLiveStatus | null {
  const metadata = event?.metadata
  if (!metadata || !('status' in metadata)) return null
  if (metadata.status === 'connected' || metadata.status === 'disconnected')
    return metadata.status
  return null
}
