import type { RouterRule } from '@root/types/router.types.js'

declare module '@services/database.service.js' {
  interface DatabaseService {
    // CONTENT ROUTER SECTION
    /**
     * Retrieves all router rules from the database
     * @returns Promise resolving to array of all router rules
     */
    getAllRouterRules(): Promise<RouterRule[]>

    /**
     * Retrieves a specific router rule by ID
     * @param id - ID of the router rule to retrieve
     * @returns Promise resolving to the router rule if found, null otherwise
     */
    getRouterRuleById(id: number): Promise<RouterRule | null>

    /**
     * Retrieves router rules by type
     * @param type - Type of router rules to retrieve (e.g., 'genre', 'user')
     * @param enabledOnly - Whether to retrieve only enabled rules (default: true)
     * @returns Promise resolving to array of matching router rules
     */
    getRouterRulesByType(
      type: string,
      enabledOnly?: boolean,
    ): Promise<RouterRule[]>

    /**
     * Retrieves router rules by action (for approval workflow)
     * @param action - Action to filter by (e.g., 'require_approval')
     * @param enabledOnly - Whether to retrieve only enabled rules (default: true)
     * @returns Promise resolving to array of matching router rules
     */
    getRouterRulesByAction(
      action: string,
      enabledOnly?: boolean,
    ): Promise<RouterRule[]>

    /**
     * Creates a new router rule
     * @param rule - Router rule data excluding auto-generated fields
     * @returns Promise resolving to the created router rule
     */
    createRouterRule(
      rule: Omit<RouterRule, 'id' | 'created_at' | 'updated_at'>,
    ): Promise<RouterRule>

    /**
     * Updates an existing router rule
     * @param id - ID of the router rule to update
     * @param updates - Partial router rule data to update
     * @returns Promise resolving to the updated router rule
     */
    updateRouterRule(
      id: number,
      updates: Partial<Omit<RouterRule, 'id' | 'created_at' | 'updated_at'>>,
    ): Promise<RouterRule>

    /**
     * Deletes a router rule by ID
     * @param id - ID of the router rule to delete
     * @returns Promise resolving to true if deleted, false otherwise
     */
    deleteRouterRule(id: number): Promise<boolean>

    /**
     * Retrieves router rules by target instance
     * @param targetType - Type of target instance
     * @param instanceId - ID of the target instance
     * @returns Promise resolving to array of matching router rules
     */
    getRouterRulesByTarget(
      targetType: 'sonarr' | 'radarr',
      instanceId: number,
    ): Promise<RouterRule[]>

    /**
     * Retrieves router rules by target type
     * @param targetType - Type of target instance
     * @returns Promise resolving to array of matching router rules
     */
    getRouterRulesByTargetType(
      targetType: 'sonarr' | 'radarr',
    ): Promise<RouterRule[]>

    /**
     * Toggles the enabled state of a router rule
     * @param id - ID of the router rule to toggle
     * @param enabled - Whether to enable or disable the rule
     * @returns Promise resolving to the updated router rule
     */
    toggleRouterRule(id: number, enabled: boolean): Promise<RouterRule>

    /**
     * Checks if any router rules exist in the database
     * @returns Promise resolving to true if any rules exist, false otherwise
     */
    hasAnyRouterRules(): Promise<boolean>
  }
}
