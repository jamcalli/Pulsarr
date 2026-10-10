import type {
  ActionResultRow,
  ActionResultStat,
} from '@/components/settings/action-results'
import type { ActionProgress } from '@/components/settings/action-row'

export interface ActionState {
  running: boolean
  /** Why the action cannot run with the saved settings, null when it can. */
  unavailableReason: string | null
  errorMessage: string | null
  result: { ranAt: number; rows: ActionResultRow[] } | null
  progress?: ActionProgress[]
}

/** A count that renders only when nonzero, in the destructive color. */
export function failedStat(label: string, value: number): ActionResultStat {
  return { label, value, destructive: true }
}

export function toActionResult<T>(
  result: { ranAt: number; data: T } | null,
  toRows: (data: T) => ActionResultRow[],
): ActionState['result'] {
  return result && { ranAt: result.ranAt, rows: toRows(result.data) }
}

export function toActionProgress(
  name: string,
  { progress, message }: { progress: number; message: string },
): ActionProgress {
  return { name, percent: Math.round(progress), message: message || undefined }
}
