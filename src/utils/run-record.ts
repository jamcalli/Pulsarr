import { errorMessage } from '@utils/error-message.js'

export type RunState = 'idle' | 'running' | 'done' | 'failed'

export interface RunStatus<Result> {
  state: RunState
  startedAt: string | null
  finishedAt: string | null
  error: string | null
  /** Set only once the run ends done. */
  result: Result | null
}

/** Overlapping runs read as one, and only the run that settles last writes the outcome. */
export interface RunRecord<Result> {
  begin(): void
  succeed(result: Result): void
  fail(error: unknown): void
  read(): RunStatus<Result>
}

const IDLE: RunStatus<never> = {
  state: 'idle',
  startedAt: null,
  finishedAt: null,
  error: null,
  result: null,
}

/** Holds the latest run in memory only, so a restart reads idle again. */
export function createRunRecord<Result>(): RunRecord<Result> {
  let status: RunStatus<Result> = IDLE
  let active = 0

  const settle = (outcome: Partial<RunStatus<Result>>) => {
    active = Math.max(active - 1, 0)
    if (active > 0) return
    status = { ...status, finishedAt: new Date().toISOString(), ...outcome }
  }

  return {
    begin: () => {
      if (active === 0) {
        status = {
          ...IDLE,
          state: 'running',
          startedAt: new Date().toISOString(),
        }
      }
      active += 1
    },
    succeed: (result) => settle({ state: 'done', result }),
    fail: (error) => settle({ state: 'failed', error: errorMessage(error) }),
    read: () => status,
  }
}
