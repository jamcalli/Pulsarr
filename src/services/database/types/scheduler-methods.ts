import type {
  DbSchedule,
  IntervalConfig,
  CronConfig,
} from '@root/types/scheduler.types.js'

declare module '../../database.service.js' {
  interface DatabaseService {
    // SCHEDULER METHODS
    /**
     * Retrieves all scheduled jobs from the database
     * @returns Promise resolving to array of all scheduled jobs
     */
    getAllSchedules(): Promise<DbSchedule[]>

    /**
     * Retrieves a specific schedule by name
     * @param name - Name of the schedule to retrieve
     * @returns Promise resolving to the schedule if found, null otherwise
     */
    getScheduleByName(name: string): Promise<DbSchedule | null>

    /**
     * Updates an existing schedule
     * @param name - Name of the schedule to update
     * @param updates - Partial schedule data to update
     * @returns Promise resolving to true if updated, false otherwise
     */
    updateSchedule(
      name: string,
      updates: Partial<
        Omit<DbSchedule, 'id' | 'name' | 'created_at' | 'updated_at'>
      >,
    ): Promise<boolean>

    /**
     * Creates a new schedule
     * @param schedule - Schedule data excluding auto-generated fields
     * @returns Promise resolving to the ID of the created schedule
     */
    createSchedule(
      schedule: Omit<DbSchedule, 'id' | 'created_at' | 'updated_at'>,
    ): Promise<number>

    /**
     * Deletes a schedule by name
     * @param name - Name of the schedule to delete
     * @returns Promise resolving to true if deleted, false otherwise
     */
    deleteSchedule(name: string): Promise<boolean>
  }
}
