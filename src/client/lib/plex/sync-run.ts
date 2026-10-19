import type { WatchlistSyncType } from '@root/types/progress.types'
import type { StatusPillView } from '@/components/status-pill'
import { WATCHLIST_SYNC_LABELS } from '@/lib/sync-progress'
import { isSyncActive, type WatchlistSyncCache } from '@/lib/watchlist-sync'

export type SyncStepId = 'verify' | 'self' | 'friends' | 'feeds'
type SyncStepStatus = 'waiting' | 'running' | 'done' | 'failed' | 'skipped'

/** A link run follows a token change and also generates the feeds, a resync only reads watchlists. */
export type SyncKind = 'link' | 'resync'

interface SyncStep {
  id: SyncStepId
  status: SyncStepStatus
  detail: string | null
}

export interface SyncRun {
  kind: SyncKind
  steps: SyncStep[]
  error: { step: SyncStepId; message: string } | null
  /** Set once the last step settles. */
  ranAt: number | null
}

export const SYNC_STEP_LABELS: Record<SyncStepId, string> = {
  verify: 'Verify the token',
  self: WATCHLIST_SYNC_LABELS['self-watchlist'],
  friends: WATCHLIST_SYNC_LABELS['others-watchlist'],
  feeds: 'Watchlist feeds',
}

/** Steps the server reports live progress for while they run. */
export const SYNC_STEP_PROGRESS: Partial<
  Record<SyncStepId, WatchlistSyncType>
> = {
  self: 'self-watchlist',
  friends: 'others-watchlist',
}

export const SYNC_STATUS_PILLS: Record<SyncStepStatus, StatusPillView> = {
  waiting: { tone: 'off', label: 'Waiting' },
  running: { tone: 'pending', label: 'Running' },
  done: { tone: 'on', label: 'Done' },
  failed: { tone: 'failed', label: 'Failed' },
  skipped: { tone: 'off', label: 'Skipped' },
}

export const SYNC_ERROR_TITLES: Record<SyncStepId, string> = {
  verify: "Couldn't verify the token.",
  self: "Couldn't read your watchlist.",
  friends: "Couldn't read friends' watchlists.",
  feeds: "Couldn't generate the watchlist feeds.",
}

/** Steps in one group run together, and only the first sync after linking needs the owner's row before friends. */
const PLAN: Record<SyncKind, readonly (readonly SyncStepId[])[]> = {
  link: [['verify'], ['self'], ['friends'], ['feeds']],
  resync: [['verify'], ['self', 'friends']],
}

/** A failure skips these steps when they have not started yet. */
const SKIPPED_BY_FAILURE: Record<SyncStepId, readonly SyncStepId[]> = {
  verify: ['self', 'friends', 'feeds'],
  self: ['friends', 'feeds'],
  friends: [],
  feeds: [],
}

/** A link run starts after the config save verified the token, so its first step is already done. */
export function startRun(kind: SyncKind): SyncRun {
  return {
    kind,
    steps: PLAN[kind].flat().map((id) => ({
      id,
      status: kind === 'link' && id === 'verify' ? 'done' : 'waiting',
      detail: null,
    })),
    error: null,
    ranAt: null,
  }
}

/** The waiting steps of the first group that still has any, empty once nothing is left to run. */
export function nextSteps(run: SyncRun): SyncStepId[] {
  const waiting = (id: SyncStepId) =>
    run.steps.some((step) => step.id === id && step.status === 'waiting')
  return (
    PLAN[run.kind].find((group) => group.some(waiting))?.filter(waiting) ?? []
  )
}

function withStep(
  run: SyncRun,
  id: SyncStepId,
  status: SyncStepStatus,
  detail: string | null,
): SyncRun {
  return {
    ...run,
    steps: run.steps.map((step) =>
      step.id === id ? { ...step, status, detail } : step,
    ),
  }
}

function markRunning(run: SyncRun, id: SyncStepId): SyncRun {
  return withStep(run, id, 'running', null)
}

export function markDone(
  run: SyncRun,
  id: SyncStepId,
  detail: string | null,
): SyncRun {
  return withStep(run, id, 'done', detail)
}

function markSkipped(run: SyncRun, id: SyncStepId, reason: string): SyncRun {
  return withStep(run, id, 'skipped', reason)
}

export function markFailed(
  run: SyncRun,
  id: SyncStepId,
  message: string,
): SyncRun {
  const skipped = SKIPPED_BY_FAILURE[id]
  return {
    ...run,
    error: run.error ?? { step: id, message },
    steps: run.steps.map((step) => {
      if (step.id === id) return { ...step, status: 'failed', detail: null }
      if (skipped.includes(step.id) && step.status === 'waiting') {
        return { ...step, status: 'skipped', detail: null }
      }
      return step
    }),
  }
}

function finishRun(run: SyncRun, ranAt: number): SyncRun {
  return { ...run, ranAt }
}

export function isRunning(run: SyncRun | null): boolean {
  return run !== null && run.ranAt === null
}

/** A sync the server runs, shown as its progress steps, null once none of them is running. */
export function serverSyncRun(events: WatchlistSyncCache): SyncRun | null {
  const steps = PLAN.link.flat().flatMap((id): SyncStep[] => {
    const type = SYNC_STEP_PROGRESS[id]
    const event = type && events[type]
    const metadata = event?.metadata
    if (!metadata || !('stage' in metadata)) return []
    const status: SyncStepStatus = isSyncActive(event)
      ? 'running'
      : metadata.stage === 'complete'
        ? 'done'
        : 'failed'
    return [{ id, status, detail: null }]
  })
  if (!steps.some((step) => step.status === 'running')) return null
  return { kind: 'resync', steps, error: null, ranAt: null }
}

export function stepFailed(run: SyncRun | null, id: SyncStepId): boolean {
  return (
    run?.steps.some((step) => step.id === id && step.status === 'failed') ??
    false
  )
}

type StepOutcome =
  | { status: 'done'; detail: string | null }
  | { status: 'skipped'; reason: string }

export type StepActions = Record<SyncStepId, () => Promise<StepOutcome>>

/** Runs each group's steps together and the next group only after they settle, reporting every change. */
export async function runSyncSteps({
  kind,
  actions,
  report,
  errorMessage,
  wait = (step) => step,
  now = Date.now,
}: {
  kind: SyncKind
  actions: StepActions
  report: (run: SyncRun) => void
  errorMessage: (error: unknown) => string
  /** Wraps each step, such as to hold its Running pill long enough to read. */
  wait?: (step: Promise<StepOutcome>) => Promise<StepOutcome>
  now?: () => number
}): Promise<SyncRun> {
  let run = startRun(kind)
  report(run)
  for (let ids = nextSteps(run); ids.length > 0; ids = nextSteps(run)) {
    for (const id of ids) run = markRunning(run, id)
    report(run)
    await Promise.all(
      ids.map(async (id) => {
        try {
          const outcome = await wait(actions[id]())
          run =
            outcome.status === 'done'
              ? markDone(run, id, outcome.detail)
              : markSkipped(run, id, outcome.reason)
        } catch (error) {
          run = markFailed(run, id, errorMessage(error))
        }
        report(run)
      }),
    )
  }
  run = finishRun(run, now())
  report(run)
  return run
}
