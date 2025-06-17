import type { DatabaseService } from '@services/database.service.js'
import type {
  DbSchedule,
  IntervalConfig,
  CronConfig,
  JobRunInfo,
} from '@root/types/scheduler.types.js'

/**
 * Parses a raw schedule database row into a typed `DbSchedule` object.
 *
 * Converts fields such as `enabled` to boolean and safely parses JSON fields like `config`, `last_run`, and `next_run`. Returns `null` if the schedule type is unknown or if parsing fails.
 *
 * @param schedule - The raw schedule row from the database to parse.
 * @returns The parsed `DbSchedule` object, or `null` if parsing fails or the type is unrecognized.
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
 * Retrieves all job schedules from the database.
 *
 * Parses each schedule row into a typed schedule object, filtering out any invalid entries.
 *
 * @returns A promise that resolves to an array of valid job schedules.
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
 * Retrieves a job schedule by its name.
 *
 * Queries the database for a schedule with the specified name and parses it into a typed schedule object. Returns `null` if no schedule is found or if parsing fails.
 *
 * @param name - The name of the schedule to retrieve
 * @returns A promise resolving to the schedule object if found, or `null` if not found or on error
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
 * Updates an existing schedule by name with the provided partial data.
 *
 * Only mutable fields are updated; immutable fields such as `id`, `name`, `created_at`, and `updated_at` cannot be changed. Returns `true` if the schedule was successfully updated, or `false` if no matching schedule was found or an error occurred.
 *
 * @param name - The name of the schedule to update
 * @param updates - Partial schedule fields to update
 * @returns Promise resolving to `true` if the schedule was updated, or `false` otherwise
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
 * Inserts a new job schedule into the database and returns its generated ID.
 *
 * Serializes configuration and run information fields as JSON. Sets creation and update timestamps to the current service time.
 *
 * @param schedule - The schedule details to insert, excluding ID and timestamps
 * @returns The ID of the newly created schedule
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
 * Deletes a schedule by its name.
 *
 * @param name - The name of the schedule to delete.
 * @returns True if the schedule was deleted; false if no matching schedule was found or an error occurred.
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
