export interface PlexConnectionValues {
  plexToken: string
}

export type ConnectionStatus =
  | 'idle'
  | 'loading'
  | 'testing'
  | 'success'
  | 'error'

export type SyncStatus = 'idle' | 'loading' | 'success' | 'error'
