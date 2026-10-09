import type {
  HeldNotification,
  HeldNotificationCreate,
} from '@root/types/notification-delivery.types.js'

declare module '@services/database.service.js' {
  interface DatabaseService {
    /**
     * Persists a notification held for quiet hours or digest batching.
     *
     * @returns The new row ID
     */
    createHeldNotification(data: HeldNotificationCreate): Promise<number>

    /**
     * Returns the IDs of users with at least one unclaimed held notification
     * due at or before `now`.
     */
    getUserIdsWithDueHeldNotifications(now: Date): Promise<number[]>

    /**
     * Returns the IDs of users with at least one unclaimed held
     * notification, due or not.
     */
    getUserIdsWithHeldNotifications(): Promise<number[]>

    /**
     * Claims every unclaimed held notification of a user for delivery and
     * returns the claimed rows. Rows already claimed are skipped, so two
     * concurrent claims never receive the same row.
     */
    claimHeldNotifications(
      userId: number,
      claimedAt: Date,
    ): Promise<HeldNotification[]>

    /**
     * Deletes held notifications after delivery.
     *
     * @returns Number of rows deleted
     */
    deleteHeldNotifications(ids: number[]): Promise<number>

    /**
     * Deletes rows that were claimed but never finished delivering because
     * the process stopped mid-delivery.
     *
     * @returns Number of rows deleted
     */
    deleteInterruptedHeldNotifications(): Promise<number>
  }
}
