import type { ProgressEvent } from '@root/types/progress.types'
import { useProgressStore } from '@/stores/progressStore'
import type { components } from '@/types/api.js'

const SETTLED_PHASES: readonly string[] = ['complete', 'failed']
export const STATUS_POLL_INTERVAL_MS = 20_000

export interface ProgressStream {
  /** Returns the unsubscribe. */
  onEvent(
    type: ProgressEvent['type'],
    callback: (event: ProgressEvent) => void,
  ): () => void
  /** Calls back each time the stream connects again after dropping, returning the unsubscribe. */
  onReconnect(callback: () => void): () => void
}

export const progressStream: ProgressStream = {
  onEvent: (type, callback) =>
    useProgressStore.getState().subscribeToType(type, callback),
  onReconnect: (callback) =>
    useProgressStore.subscribe((state, previous) => {
      if (state.isConnected && !previous.isConnected) callback()
    }),
}

/** Narrows the events of one type to a single job, such as by job name. */
export type JobEventFilter = (event: ProgressEvent) => boolean

/** True for the complete and failed events of the job, the ones after which its status reads settled. */
export function isSettledJobEvent(
  event: ProgressEvent,
  isJobEvent?: JobEventFilter,
): boolean {
  if (!SETTLED_PHASES.includes(event.phase)) return false
  return isJobEvent ? isJobEvent(event) : true
}

interface BackgroundJob<Status> {
  eventType: ProgressEvent['type']
  isJobEvent?: JobEventFilter
  /** Resolves once the server accepted the start. */
  start: () => Promise<void>
  readStatus: () => Promise<Status>
  isSettled: (status: Status) => boolean
}

/** Starts the job, then resolves with its status once settled, rereading it after each settled event, each reconnect and each slow poll. */
export function startAndAwaitStatus<Status>(
  job: BackgroundJob<Status>,
  stream: ProgressStream = progressStream,
): Promise<Status> {
  return new Promise((resolve, reject) => {
    let started = false
    let finished = false
    const unsubscribers: Array<() => void> = []
    const finish = () => {
      finished = true
      clearInterval(poll)
      for (const unsubscribe of unsubscribers) unsubscribe()
    }
    const check = () => {
      if (!started || finished) return
      job.readStatus().then(
        (status) => {
          if (finished || !job.isSettled(status)) return
          finish()
          resolve(status)
        },
        (error: unknown) => {
          if (finished) return
          finish()
          reject(error)
        },
      )
    }

    const poll = setInterval(check, STATUS_POLL_INTERVAL_MS)
    unsubscribers.push(
      stream.onEvent(job.eventType, (event) => {
        if (isSettledJobEvent(event, job.isJobEvent)) check()
      }),
      stream.onReconnect(check),
    )
    job.start().then(
      () => {
        started = true
        check()
      },
      (error: unknown) => {
        finish()
        reject(error)
      },
    )
  })
}

interface BackgroundRun {
  state: components['schemas']['BackgroundRunState']
  error: string | null
}

export function isRunSettled(status: BackgroundRun): boolean {
  return status.state === 'done' || status.state === 'failed'
}

/** Throws a failed run as an API error body, so error copy shows the server's reason. */
export function requireRunDone<Status extends BackgroundRun>(
  status: Status,
  fallback: string,
): Status {
  if (status.state === 'failed') throw { message: status.error ?? fallback }
  return status
}
