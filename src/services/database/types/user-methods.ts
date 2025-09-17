import type { User } from '@root/types/config.types.js'
import type { AdminUser } from '@schemas/auth/auth.js'

declare module '@services/database.service.js' {
  interface DatabaseService {
    // USER MANAGEMENT
    /**
     * Creates a new user in the database
     * @param userData - User data excluding id and timestamps
     * @returns Promise resolving to the created user with ID and timestamps
     */
    createUser(
      userData: Omit<User, 'id' | 'created_at' | 'updated_at'>,
    ): Promise<User>

    /**
     * Retrieves a user by ID or name
     * @param identifier - User ID (number) or username (string)
     * @returns Promise resolving to the user if found, undefined otherwise
     */
    getUser(identifier: number | string): Promise<User | undefined>

    /**
     * Updates a user's information
     * @param id - ID of the user to update
     * @param data - Partial user data to update
     * @returns Promise resolving to true if the user was updated, false otherwise
     */
    updateUser(
      id: number,
      data: Partial<Omit<User, 'id' | 'created_at' | 'updated_at'>>,
    ): Promise<boolean>

    /**
     * Bulk updates multiple users with the same set of changes
     * @param userIds - Array of user IDs to update
     * @param data - Partial user data to apply to all specified users
     * @returns Promise resolving to object with count of updated users and array of failed IDs
     */
    bulkUpdateUsers(
      userIds: number[],
      data: Partial<Omit<User, 'id' | 'created_at' | 'updated_at'>>,
    ): Promise<{ updatedCount: number; failedIds: number[] }>

    /**
     * Retrieves all users in the database
     * @returns Promise resolving to an array of all users
     */
    getAllUsers(): Promise<User[]>

    /**
     * Retrieves all users with their watchlist item counts
     * @returns Promise resolving to array of users with watchlist count property
     */
    getUsersWithWatchlistCount(): Promise<
      (User & { watchlist_count: number })[]
    >

    /**
     * Retrieves the primary user from the database
     * @returns Promise resolving to the primary user if found, undefined otherwise
     */
    getPrimaryUser(): Promise<User | undefined>

    /**
     * Creates a new admin user in the database
     * @param userData - Admin user data including email, username, password, and role
     * @returns Promise resolving to true if created successfully
     */
    createAdminUser(userData: {
      email: string
      username: string
      password: string
      role: string
    }): Promise<boolean>

    /**
     * Retrieves an admin user by email
     * @param email - Email address of the admin user
     * @returns Promise resolving to the admin user if found, undefined otherwise
     */
    getAdminUser(email: string): Promise<AdminUser | undefined>

    /**
     * Retrieves an admin user by username
     * @param username - Username of the admin user
     * @returns Promise resolving to the admin user if found, undefined otherwise
     */
    getAdminUserByUsername(username: string): Promise<AdminUser | undefined>

    /**
     * Checks if any admin users exist in the database
     * @returns Promise resolving to true if admin users exist, false otherwise
     */
    hasAdminUsers(): Promise<boolean>

    /**
     * Updates an admin user's password
     * @param email - Email address of the admin user
     * @param hashedPassword - New hashed password
     * @returns Promise resolving to true if password was updated, false otherwise
     */
    updateAdminPassword(email: string, hashedPassword: string): Promise<boolean>

    /**
     * Checks if any users have sync disabled
     * @returns Promise resolving to true if any users have sync disabled, false otherwise
     */
    hasUsersWithSyncDisabled(): Promise<boolean>

    /**
     * Checks if any users have approval configuration that requires user-specific processing
     * @returns Promise resolving to true if any users have quotas, approval flags, or approval router rules
     */
    hasUsersWithApprovalConfig(): Promise<boolean>

    /**
     * Sets a user as the primary token user, ensuring only one user has this flag
     * @param userId - ID of the user to set as primary
     * @returns Promise resolving to true if successful
     */
    setPrimaryUser(userId: number): Promise<boolean>

    /**
     * Deletes a user from the database by ID
     * @param userId - ID of the user to delete
     * @returns Promise resolving to true if user was deleted, false otherwise
     */
    deleteUser(userId: number): Promise<boolean>

    /**
     * Deletes multiple users from the database by their IDs
     * @param userIds - Array of user IDs to delete
     * @returns Promise resolving to object with count of deleted users and array of failed IDs.
     * @remarks On SQLite, `failedIds` will be `[]` because specific failed IDs cannot be determined reliably.
     */
    deleteUsers(
      userIds: number[],
    ): Promise<{ deletedCount: number; failedIds: number[] }>
  }
}
