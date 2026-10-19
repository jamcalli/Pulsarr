import type {
  ProgressEvent,
  WatchlistSyncMetadata,
  WatchlistSyncType,
} from '@root/types/progress.types'
import {
  isRunning,
  markDone,
  markFailed,
  nextSteps,
  runSyncSteps,
  type StepActions,
  type SyncRun,
  type SyncStepId,
  serverSyncRun,
  startRun,
  stepFailed,
} from '@/lib/plex/sync-run'

function statuses(run: SyncRun) {
  return Object.fromEntries(run.steps.map((step) => [step.id, step.status]))
}

function actions(overrides: Partial<StepActions> = {}): StepActions {
  const done = async () => ({ status: 'done' as const, detail: null })
  return { verify: done, self: done, friends: done, feeds: done, ...overrides }
}

function fail(message: string) {
  return async () => {
    throw new Error(message)
  }
}

async function run(kind: 'link' | 'resync', stepActions: StepActions) {
  const reports: SyncRun[] = []
  const finished = await runSyncSteps({
    kind,
    actions: stepActions,
    report: (next) => reports.push(next),
    errorMessage: (error) => (error instanceof Error ? error.message : ''),
    now: () => 1000,
  })
  return { finished, reports }
}

describe('startRun', () => {
  it('starts a link run with the token already verified', () => {
    expect(statuses(startRun('link'))).toEqual({
      verify: 'done',
      self: 'waiting',
      friends: 'waiting',
      feeds: 'waiting',
    })
  })

  it('starts a resync with verify, then both watchlists together', () => {
    const resync = startRun('resync')
    expect(resync.steps.map((step) => step.id)).toEqual([
      'verify',
      'self',
      'friends',
    ])
    expect(nextSteps(resync)).toEqual(['verify'])
    const verified = markDone(resync, 'verify', null)
    expect(nextSteps(verified)).toEqual(['self', 'friends'])
  })
})

describe('markFailed', () => {
  it.each<[SyncStepId, Record<string, string>]>([
    [
      'verify',
      {
        verify: 'failed',
        self: 'skipped',
        friends: 'skipped',
        feeds: 'skipped',
      },
    ],
    [
      'self',
      {
        verify: 'waiting',
        self: 'failed',
        friends: 'skipped',
        feeds: 'skipped',
      },
    ],
    [
      'friends',
      {
        verify: 'waiting',
        self: 'waiting',
        friends: 'failed',
        feeds: 'waiting',
      },
    ],
  ])('a %s failure skips only the steps that depend on it', (id, expected) => {
    const waiting: SyncRun = {
      kind: 'link',
      steps: (['verify', 'self', 'friends', 'feeds'] as const).map((step) => ({
        id: step,
        status: 'waiting',
        detail: null,
      })),
      error: null,
      ranAt: null,
    }
    const failed = markFailed(waiting, id, 'boom')
    expect(statuses(failed)).toEqual(expected)
    expect(failed.error).toEqual({ step: id, message: 'boom' })
  })
})

describe('runSyncSteps', () => {
  it('starts each step only after the one before it settles', async () => {
    const order: string[] = []
    const track = (id: string) => async () => {
      order.push(`${id} start`)
      await Promise.resolve()
      order.push(`${id} end`)
      return { status: 'done' as const, detail: null }
    }
    await run(
      'link',
      actions({
        self: track('self'),
        friends: track('friends'),
        feeds: track('feeds'),
      }),
    )

    expect(order).toEqual([
      'self start',
      'self end',
      'friends start',
      'friends end',
      'feeds start',
      'feeds end',
    ])
  })

  it('skips friends and feeds when the owner sync fails', async () => {
    const friends = vi.fn()
    const feeds = vi.fn()
    const { finished } = await run(
      'link',
      actions({ self: fail('Plex is down'), friends, feeds }),
    )

    expect(statuses(finished)).toEqual({
      verify: 'done',
      self: 'failed',
      friends: 'skipped',
      feeds: 'skipped',
    })
    expect(friends).not.toHaveBeenCalled()
    expect(feeds).not.toHaveBeenCalled()
    expect(finished.error).toEqual({ step: 'self', message: 'Plex is down' })
  })

  it('still generates the feeds when friends fail', async () => {
    const { finished } = await run(
      'link',
      actions({ friends: fail('503 Service Unavailable') }),
    )

    expect(statuses(finished)).toMatchObject({
      friends: 'failed',
      feeds: 'done',
    })
    expect(stepFailed(finished, 'friends')).toBe(true)
  })

  it('records a skipped step with its reason', async () => {
    const { finished } = await run(
      'link',
      actions({
        feeds: async () => ({ status: 'skipped', reason: 'Needs Plex Pass.' }),
      }),
    )

    expect(finished.steps.at(-1)).toEqual({
      id: 'feeds',
      status: 'skipped',
      detail: 'Needs Plex Pass.',
    })
  })

  it('reports a running step and finishes with the run time', async () => {
    const { finished, reports } = await run('resync', actions())

    expect(
      reports.some((report) => statuses(report).verify === 'running'),
    ).toBe(true)
    expect(isRunning(reports[0] ?? null)).toBe(true)
    expect(finished.ranAt).toBe(1000)
    expect(isRunning(finished)).toBe(false)
  })
})

function syncEvent(
  type: WatchlistSyncType,
  stage: WatchlistSyncMetadata['stage'],
): ProgressEvent {
  return {
    operationId: `${type}-1`,
    type,
    phase: stage,
    progress: 50,
    message: stage,
    metadata: { stage, count: null },
  }
}

describe('serverSyncRun', () => {
  it('is null while no watchlist sync runs', () => {
    expect(serverSyncRun({})).toBeNull()
    expect(
      serverSyncRun({
        'self-watchlist': syncEvent('self-watchlist', 'complete'),
        'others-watchlist': syncEvent('others-watchlist', 'failed'),
      }),
    ).toBeNull()
  })

  it('shows only the step that is running', () => {
    expect(
      serverSyncRun({
        'others-watchlist': syncEvent('others-watchlist', 'reading'),
      }),
    ).toEqual({
      kind: 'resync',
      steps: [{ id: 'friends', status: 'running', detail: null }],
      error: null,
      ranAt: null,
    })
  })

  it('shows both steps running in plan order', () => {
    const run = serverSyncRun({
      'others-watchlist': syncEvent('others-watchlist', 'finding-friends'),
      'self-watchlist': syncEvent('self-watchlist', 'processing'),
    })
    expect(run?.steps.map((step) => step.id)).toEqual(['self', 'friends'])
    expect(run && statuses(run)).toEqual({
      self: 'running',
      friends: 'running',
    })
  })

  it('keeps a step that settled while the other still runs', () => {
    const finished = serverSyncRun({
      'self-watchlist': syncEvent('self-watchlist', 'complete'),
      'others-watchlist': syncEvent('others-watchlist', 'saving'),
    })
    const failed = serverSyncRun({
      'self-watchlist': syncEvent('self-watchlist', 'reading'),
      'others-watchlist': syncEvent('others-watchlist', 'failed'),
    })
    expect(finished && statuses(finished)).toEqual({
      self: 'done',
      friends: 'running',
    })
    expect(failed && statuses(failed)).toEqual({
      self: 'running',
      friends: 'failed',
    })
  })
})
