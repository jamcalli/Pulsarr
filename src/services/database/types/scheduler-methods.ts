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
     * @returns Promise resolving to the updated schedule
     */
    updateSchedule(name: string, updates: Partial<{ enabled: boolean, interval_config: IntervalConfig, cron_config: CronConfig, last_run: Date | null, next_run: Date | null }>): Promise<DbSchedule>

    /**
     * Creates a new schedule
     * @param schedule - Schedule data excluding auto-generated fields
     * @returns Promise resolving to the created schedule
     */
    createSchedule(schedule: Omit<DbSchedule, 'id' | 'created_at' | 'updated_at'>): Promise<DbSchedule>

    /**
     * Deletes a schedule by name
     * @param name - Name of the schedule to delete
     * @returns Promise resolving to true if deleted, false otherwise
     */
    deleteSchedule(name: string): Promise<boolean>
  }
}