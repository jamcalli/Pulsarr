import type { ProgressEvent } from '@root/types/progress.types.js'

export type SyncState = 'running' | 'starting' | 'stopping' | 'stopped'

export interface SyncStatus {
  /** Null until the progress stream has reported the workflow status. */
  state: SyncState | null
  mode: 'rss' | 'polling' | null
}

const SYNC_STATES: readonly SyncState[] = [
  'running',
  'starting',
  'stopping',
  'stopped',
]

function isSyncState(value: string): value is SyncState {
  return SYNC_STATES.some((state) => state === value)
}

export function syncStatusFrom(event: ProgressEvent | undefined): SyncStatus {
  const metadata = event?.metadata
  if (!metadata || !('status' in metadata) || !isSyncState(metadata.status)) {
    return { state: null, mode: null }
  }
  return {
    state: metadata.status,
    mode: 'syncMode' in metadata ? metadata.syncMode : null,
  }
}

export const SYNC_MODE_LABELS: Record<'rss' | 'polling', string> = {
  rss: 'RSS',
  polling: 'Polling',
}

export type SyncAction = 'start' | 'stop'

export interface SyncControl {
  action: SyncAction
  /** True while the workflow is moving toward the action's end state. */
  busy: boolean
}

const SYNC_CONTROLS: Record<SyncState, SyncControl> = {
  running: { action: 'stop', busy: false },
  stopped: { action: 'start', busy: false },
  starting: { action: 'start', busy: true },
  stopping: { action: 'stop', busy: true },
}

export function syncControlFor(state: SyncState | null): SyncControl | null {
  return state ? SYNC_CONTROLS[state] : null
}

export const SYNC_ACTION_LABELS: Record<
  SyncAction,
  { idle: string; busy: string; full: string }
> = {
  start: { idle: 'Start', busy: 'Starting...', full: 'Start sync' },
  stop: { idle: 'Stop', busy: 'Stopping...', full: 'Stop sync' },
}

export function syncStateLabel(state: SyncState | null): string {
  return state ?? 'unknown'
}
