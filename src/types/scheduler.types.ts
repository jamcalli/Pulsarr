/**
 * Type for schedule information in the Db
 */
export interface DbSchedule {
  id: number
  name: string
  type: 'interval' | 'cron'
  config: IntervalConfig | CronConfig
  enabled: boolean
  last_run: JobRunInfo | null
  next_run: JobRunInfo | null
  created_at: string
  updated_at: string
}

/**
 * Type for job run status information
 */
export interface JobRunInfo {
  time: string
  status: 'completed' | 'failed' | 'pending'
  error?: string
  estimated?: boolean
}

/**
 * Type for configuration of interval jobs
 */
export interface IntervalConfig {
  days?: number
  hours?: number
  minutes?: number
  seconds?: number
  runImmediately?: boolean
}

/**
 * Type for configuration of cron jobs
 */
export interface CronConfig {
  expression: string
}
