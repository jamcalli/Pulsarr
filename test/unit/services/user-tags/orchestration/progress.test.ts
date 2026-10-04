import { withProgress } from '@services/user-tags/orchestration/progress.js'
import { describe, expect, it, vi } from 'vitest'
import { createUserTagDeps } from '../../../../mocks/user-tag-deps.js'

function params(connected: boolean) {
  const deps = createUserTagDeps({
    progress: { hasActiveConnections: vi.fn(() => connected) },
  })
  return {
    type: 'sonarr-tagging' as const,
    start: 'Starting',
    complete: (result: number) => `Done ${result}`,
    failure: 'Error syncing',
    deps,
  }
}

describe('withProgress', () => {
  it('emits start, the run phases and complete under one operation id', async () => {
    const p = params(true)

    const result = await withProgress(p, async (phase) => {
      phase('tagging-series', 95, 'Tagged')
      return 7
    })

    expect(result).toBe(7)
    const events = vi.mocked(p.deps.progress.emit).mock.calls.map(([e]) => e)
    expect(events.map((e) => [e.phase, e.progress, e.message])).toEqual([
      ['start', 5, 'Starting'],
      ['tagging-series', 95, 'Tagged'],
      ['complete', 100, 'Done 7'],
    ])
    expect(new Set(events.map((e) => e.operationId)).size).toBe(1)
    expect(events[0].type).toBe('sonarr-tagging')
  })

  it('emits error and rethrows when the run throws', async () => {
    const p = params(true)
    const failure = new Error('arr down')

    await expect(
      withProgress(p, async () => {
        throw failure
      }),
    ).rejects.toBe(failure)

    const events = vi.mocked(p.deps.progress.emit).mock.calls.map(([e]) => e)
    expect(events.map((e) => [e.phase, e.progress, e.message])).toEqual([
      ['start', 5, 'Starting'],
      ['error', 100, 'Error syncing: arr down'],
    ])
  })

  it('emits nothing when no client is connected but still runs', async () => {
    const p = params(false)

    const result = await withProgress(p, async (phase) => {
      phase('tagging-series', 95, 'Tagged')
      return 1
    })

    expect(result).toBe(1)
    expect(p.deps.progress.emit).not.toHaveBeenCalled()
  })
})
