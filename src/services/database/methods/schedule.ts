import type { DatabaseService } from '@services/database.service.js'
import type {
  DbSchedule,
  IntervalConfig,
  CronConfig,
  JobRunInfo,
} from '@root/types/scheduler.types.js'

/**
 * Helper function to parse a raw schedule row into a properly typed DbSchedule
 */
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
    // Parse common fields
    const commonFields = {
      id: schedule.id,
      name: schedule.name,
      enabled: Boolean(schedule.enabled),
      last_run: schedule.last_run
        ? typeof schedule.last_run === 'string'
          ? this.safeJsonParse<JobRunInfo>(
              schedule.last_run,
              {} as JobRunInfo,
              'schedule.last_run',
            )
          : (schedule.last_run as JobRunInfo)
        : null,
      next_run: schedule.next_run
        ? typeof schedule.next_run === 'string'
          ? this.safeJsonParse<JobRunInfo>(
              schedule.next_run,
              {} as JobRunInfo,
              'schedule.next_run',
            )
          : (schedule.next_run as JobRunInfo)
        : null,
      created_at: schedule.created_at,
      updated_at: schedule.updated_at,
    }

    // Parse the config
    const parsedConfig =
      typeof schedule.config === 'string'
        ? this.safeJsonParse(schedule.config, {}, 'schedule.config')
        : schedule.config

    // Return properly typed object based on schedule type
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
    this.log.error(`Error parsing schedule ${schedule.name}:`, error)
    return null
  }
}

/**
 * Retrieves all job schedules from the database
 *
 * @returns Promise resolving to array of all job schedules
 */
export async function getAllSchedules(
  this: DatabaseService,
): Promise<DbSchedule[]> {
  try {
    const schedules = await this.knex('schedules').select('*')

    return schedules
      .map((schedule) => parseScheduleRow.call(this, schedule))
      .filter((schedule): schedule is DbSchedule => schedule !== null)
  } catch (error) {
    this.log.error('Error fetching all schedules:', error)
    return []
  }
}

/**
 * Retrieves a specific job schedule by name
 *
 * @param name - Name of the schedule to retrieve
 * @returns Promise resolving to the schedule if found, null otherwise
 */
export async function getScheduleByName(
  this: DatabaseService,
  name: string,
): Promise<DbSchedule | null> {
  try {
    const schedule = await this.knex('schedules').where({ name }).first()

    if (!schedule) return null

    return parseScheduleRow.call(this, schedule)
  } catch (error) {
    this.log.error(`Error fetching schedule ${name}:`, error)
    return null
  }
}

/**
 * Updates an existing job schedule
 *
 * @param name - Name of the schedule to update
 * @param updates - Partial schedule data to update
 * @returns Promise resolving to true if the schedule was updated, false otherwise
 */
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
    this.log.error(`Error updating schedule ${name}:`, error)
    return false
  }
}

/**
 * Creates a new job schedule in the database
 *
 * @param schedule - Schedule data to create
 * @returns Promise resolving to the ID of the created schedule
 */
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
    this.log.error(`Error creating schedule ${schedule.name}:`, error)
    throw error
  }
}

/**
 * Deletes a job schedule
 *
 * @param name - Name of the schedule to delete
 * @returns Promise resolving to true if deleted, false otherwise
 */
export async function deleteSchedule(
  this: DatabaseService,
  name: string,
): Promise<boolean> {
  try {
    const deleted = await this.knex('schedules').where({ name }).delete()
    return deleted > 0
  } catch (error) {
    this.log.error(`Error deleting schedule ${name}:`, error)
    return false
  }
}
