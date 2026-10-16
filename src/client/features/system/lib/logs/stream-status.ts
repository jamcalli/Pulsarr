export type StreamStatus =
  | { kind: 'connecting' }
  | { kind: 'live' }
  | { kind: 'paused' }
  | { kind: 'retrying'; attempt: number; delayMs: number }
  | { kind: 'failed' }
