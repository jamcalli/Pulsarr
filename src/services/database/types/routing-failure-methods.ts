import type {
  RoutingFailure,
  RoutingFailureFilters,
  RoutingFailureInput,
  RoutingFailureSummary,
} from '@root/types/routing-failure.types.js'

declare module '@services/database.service.js' {
  interface DatabaseService {
    /**
     * Replaces the failures recorded for a user's watchlist item with the
     * outcome of its latest routing attempt. An empty list clears the item.
     *
     * @returns False when the user has no watchlist row for the key
     */
    setRoutingFailures(
      userId: number,
      key: string,
      failures: RoutingFailureInput[],
    ): Promise<boolean>

    /**
     * Removes every failure recorded for a user's watchlist item.
     *
     * @returns Number of rows deleted
     */
    clearRoutingFailures(userId: number, key: string): Promise<number>

    /**
     * Returns `userId:key` for every watchlist item with a recorded failure.
     */
    getRoutingFailureKeys(): Promise<Set<string>>

    /**
     * Returns recorded failures joined with their item, user and instance,
     * most recent first.
     */
    getRoutingFailures(
      filters?: RoutingFailureFilters,
    ): Promise<RoutingFailure[]>

    /**
     * Counts failed watchlist items overall, per category and per user.
     */
    getRoutingFailureSummary(): Promise<RoutingFailureSummary>

    /**
     * Returns the ids of watchlist items with a recorded failure matching the
     * filters, leaving out low-severity-only items unless a category is given.
     */
    getRoutingFailureItemIds(filters?: RoutingFailureFilters): Promise<number[]>

    /**
     * Returns whether a watchlist item currently has any recorded failure.
     */
    hasRoutingFailures(watchlistItemId: number): Promise<boolean>
  }
}
