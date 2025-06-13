declare module '../../database.service.js' {
  interface DatabaseService {
    // GENERAL METHODS
    /**
     * Closes the database connection
     * Should be called during application shutdown to properly clean up resources
     */
    close(): Promise<void>
  }
}