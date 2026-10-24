import type { ProgressEvent } from '@root/types/progress.types.js'
import { plexLiveStatusFrom } from '@/lib/plex-live-status'

function statusEvent(metadata: ProgressEvent['metadata']): ProgressEvent {
  return {
    operationId: 'plex-sse-status',
    type: 'system',
    phase: 'info',
    progress: 0,
    message: 'Plex SSE status',
    metadata,
  }
}

describe('plexLiveStatusFrom', () => {
  it.each(['connected', 'disconnected'] as const)(
    'reads %s from the status event',
    (status) => {
      expect(plexLiveStatusFrom(statusEvent({ status }))).toBe(status)
    },
  )

  it.each([
    ['no event', undefined],
    ['no metadata', statusEvent(undefined)],
    ['empty metadata', statusEvent({})],
    ['an unexpected status', statusEvent({ status: 'running' })],
  ])('is null with %s', (_, event) => {
    expect(plexLiveStatusFrom(event)).toBeNull()
  })
})
