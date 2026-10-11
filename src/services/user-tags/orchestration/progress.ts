import type { ProgressEvent } from '@root/types/progress.types.js'
import type { UserTagDeps } from '../types.js'

export type EmitPhase = (
  phase: string,
  progress: number,
  message: string,
) => void

export interface ProgressParams<T> {
  type: ProgressEvent['type']
  start: string
  complete: (result: T) => string
  /** Logged as `${failure}:` and emitted as `${failure}: ${error message}`. */
  failure: string
  deps: Pick<UserTagDeps, 'logger' | 'progress'>
}

/** Phases are dropped when no client was connected at the start. */
export async function withProgress<T>(
  params: ProgressParams<T>,
  run: (phase: EmitPhase) => Promise<T>,
): Promise<T> {
  const { type, failure, deps } = params
  const operationId = `${type}-${Date.now()}`
  const emit = deps.progress.hasActiveConnections()
  const phase: EmitPhase = (name, progress, message) => {
    if (emit) {
      deps.progress.emit({ operationId, type, phase: name, progress, message })
    }
  }

  try {
    phase('start', 5, params.start)
    const result = await run(phase)
    phase('complete', 100, params.complete(result))
    return result
  } catch (error) {
    deps.logger.error({ error }, `${failure}:`)
    phase(
      'error',
      100,
      `${failure}: ${error instanceof Error ? error.message : String(error)}`,
    )
    throw error
  }
}
