import type { ProgressEvent } from '@root/types/progress.types.js'
import { systemStatusFrom } from '@/lib/system-status'

const STATUSES = ['running', 'stopped'] as const

function statusEvent(metadata: ProgressEvent['metadata']): ProgressEvent {
  return {
    operationId: 'discord-status',
    type: 'system',
    phase: 'info',
    progress: 100,
    message: 'Discord bot status',
    metadata,
  }
}

describe('systemStatusFrom', () => {
  it('reads a known status from the event', () => {
    expect(systemStatusFrom(statusEvent({ status: 'running' }), STATUSES)).toBe(
      'running',
    )
  })

  it.each([
    ['no event', undefined],
    ['no metadata', statusEvent(undefined)],
    ['an unknown status', statusEvent({ status: 'starting' })],
  ])('is null with %s', (_, event) => {
    expect(systemStatusFrom(event, STATUSES)).toBeNull()
  })
})
