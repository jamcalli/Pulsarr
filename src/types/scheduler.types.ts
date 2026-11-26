interface ScheduleRowFields {
  id: number
  name: string
  enabled: boolean
  last_run: JobRunInfo | null
  next_run: JobRunInfo | null
  created_at: string
  updated_at: string
}

export type DbSchedule =
  | (ScheduleRowFields & { type: 'interval'; config: IntervalConfig })
  | (ScheduleRowFields & { type: 'cron'; config: CronConfig })

export interface JobRunInfo {
  time: string
  status: 'completed' | 'failed' | 'pending'
  error?: string
  estimated?: boolean
}

export interface IntervalConfig {
  days?: number
  hours?: number
  minutes?: number
  seconds?: number
}

export interface CronConfig {
  expression: string
}

export type ScheduleSpec =
  | { type: 'interval'; config: IntervalConfig }
  | { type: 'cron'; config: CronConfig }

export type DeclaredSchedule = ScheduleSpec & { enabled?: boolean }
