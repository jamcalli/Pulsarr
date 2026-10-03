import type { ProgressEvent } from '@root/types/progress.types.js'
import {
  syncControlFor,
  syncStateLabel,
  syncStatusFrom,
} from '@/lib/sync-status'

function statusEvent(metadata: ProgressEvent['metadata']): ProgressEvent {
  return {
    operationId: 'watchlist-workflow-status',
    type: 'system',
    phase: 'info',
    progress: 0,
    message: 'Watchlist workflow status',
    metadata,
  }
}

describe('syncStatusFrom', () => {
  it('reads state and mode from the workflow event', () => {
    expect(
      syncStatusFrom(
        statusEvent({ status: 'running', syncMode: 'rss', rssAvailable: true }),
      ),
    ).toEqual({ state: 'running', mode: 'rss' })
  })

  it('leaves mode null when the event has none', () => {
    expect(syncStatusFrom(statusEvent({ status: 'stopped' }))).toEqual({
      state: 'stopped',
      mode: null,
    })
  })

  it.each([
    ['no event', undefined],
    ['no metadata', statusEvent(undefined)],
    ['empty metadata', statusEvent({})],
    ['an unknown status', statusEvent({ status: 'exploded' })],
  ])('is unknown with %s', (_, event) => {
    expect(syncStatusFrom(event)).toEqual({ state: null, mode: null })
  })
})

describe('syncControlFor', () => {
  it.each([
    ['running', { action: 'stop', busy: false }],
    ['stopped', { action: 'start', busy: false }],
    ['starting', { action: 'start', busy: true }],
    ['stopping', { action: 'stop', busy: true }],
  ] as const)('offers the right control when %s', (state, control) => {
    expect(syncControlFor(state)).toEqual(control)
  })

  it('offers no control while the state is unknown', () => {
    expect(syncControlFor(null)).toBeNull()
  })
})

describe('syncStateLabel', () => {
  it('names the state', () => {
    expect(syncStateLabel('stopping')).toBe('stopping')
  })

  it('says unknown before the first status event', () => {
    expect(syncStateLabel(null)).toBe('unknown')
  })
})
