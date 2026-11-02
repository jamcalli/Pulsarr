import type {
  CronConfig,
  DbSchedule,
  IntervalConfig,
  JobRunInfo,
} from '@root/types/scheduler.types.js'
import type { DatabaseService } from '@services/database.service.js'
import { parseJsonOr } from '@utils/json.js'

/** Returns null for an unknown type or a parse failure */
function parseScheduleRow(
  this: DatabaseService,
  schedule: {
    id: number
    name: string
    type: string
    config: string | object
    enabled: boolean | number
    last_run: string | JobRunInfo | null
    next_run: string | JobRunInfo | null
    created_at: string
    updated_at: string
  },
): DbSchedule | null {
  try {
    const commonFields = {
      id: schedule.id,
      name: schedule.name,
      enabled: Boolean(schedule.enabled),
      last_run: schedule.last_run
        ? typeof schedule.last_run === 'string'
          ? parseJsonOr<JobRunInfo>(
              schedule.last_run,
              {} as JobRunInfo,
              this.log,
              'schedule.last_run',
            )
          : (schedule.last_run as JobRunInfo)
        : null,
      next_run: schedule.next_run
        ? typeof schedule.next_run === 'string'
          ? parseJsonOr<JobRunInfo>(
              schedule.next_run,
              {} as JobRunInfo,
              this.log,
              'schedule.next_run',
            )
          : (schedule.next_run as JobRunInfo)
        : null,
      created_at: schedule.created_at,
      updated_at: schedule.updated_at,
    }

    const parsedConfig =
      typeof schedule.config === 'string'
        ? parseJsonOr(schedule.config, {}, this.log, 'schedule.config')
        : schedule.config

    if (schedule.type === 'interval') {
      return {
        ...commonFields,
        type: 'interval' as const,
        config: parsedConfig as IntervalConfig,
      }
    }

    if (schedule.type === 'cron') {
      return {
        ...commonFields,
        type: 'cron' as const,
        config: parsedConfig as CronConfig,
      }
    }

    this.log.warn(`Unknown schedule type: ${schedule.type}`)
    return null
  } catch (error) {
    this.log.error({ error }, `Error parsing schedule ${schedule.name}:`)
    return null
  }
}

/** Skips unparseable rows and returns [] on error */
export async function getAllSchedules(
  this: DatabaseService,
): Promise<DbSchedule[]> {
  try {
    const schedules = await this.knex('schedules').select('*')

    return schedules
      .map((schedule) => parseScheduleRow.call(this, schedule))
      .filter((schedule): schedule is DbSchedule => schedule !== null)
  } catch (error) {
    this.log.error({ error }, 'Error fetching all schedules:')
    return []
  }
}

/** Returns null when missing, unparseable or on error */
export async function getScheduleByName(
  this: DatabaseService,
  name: string,
): Promise<DbSchedule | null> {
  try {
    const schedule = await this.knex('schedules').where({ name }).first()

    if (!schedule) return null

    return parseScheduleRow.call(this, schedule)
  } catch (error) {
    this.log.error({ error }, `Error fetching schedule ${name}:`)
    return null
  }
}

/** Returns false when no schedule matched or on error */
export async function updateSchedule(
  this: DatabaseService,
  name: string,
  updates: Partial<
    Omit<DbSchedule, 'id' | 'name' | 'created_at' | 'updated_at'>
  >,
): Promise<boolean> {
  try {
    const updateData: Record<string, unknown> = {
      updated_at: this.timestamp,
    }

    if (updates.config !== undefined) {
      updateData.config = JSON.stringify(updates.config)
    }

    if (updates.last_run !== undefined) {
      updateData.last_run = updates.last_run
        ? JSON.stringify(updates.last_run)
        : null
    }

    if (updates.next_run !== undefined) {
      updateData.next_run = updates.next_run
        ? JSON.stringify(updates.next_run)
        : null
    }

    if (updates.enabled !== undefined) {
      updateData.enabled = updates.enabled
    }

    if (updates.type !== undefined) {
      updateData.type = updates.type
    }

    const updated = await this.knex('schedules')
      .where({ name })
      .update(updateData)

    return updated > 0
  } catch (error) {
    this.log.error({ error }, `Error updating schedule ${name}:`)
    return false
  }
}

export async function createSchedule(
  this: DatabaseService,
  schedule: Omit<DbSchedule, 'id' | 'created_at' | 'updated_at'>,
): Promise<number> {
  try {
    const insertData: Record<string, unknown> = {
      name: schedule.name,
      type: schedule.type,
      config: JSON.stringify(schedule.config),
      enabled: schedule.enabled,
      last_run: schedule.last_run ? JSON.stringify(schedule.last_run) : null,
      next_run: schedule.next_run ? JSON.stringify(schedule.next_run) : null,
      created_at: this.timestamp,
      updated_at: this.timestamp,
    }

    const result = await this.knex('schedules')
      .insert(insertData)
      .returning('id')

    return this.extractId(result)
  } catch (error) {
    this.log.error({ error }, `Error creating schedule ${schedule.name}:`)
    throw error
  }
}

/** Returns false when no schedule matched or on error */
export async function deleteSchedule(
  this: DatabaseService,
  name: string,
): Promise<boolean> {
  try {
    const deleted = await this.knex('schedules').where({ name }).delete()
    return deleted > 0
  } catch (error) {
    this.log.error({ error }, `Error deleting schedule ${name}:`)
    return false
  }
}
