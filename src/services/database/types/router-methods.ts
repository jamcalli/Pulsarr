declare module '../../database.service.js' {
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
     * Retrieves router rules by content type
     * @param contentType - Type of content ('movie' or 'show')
     * @returns Promise resolving to array of matching router rules
     */
    getRouterRulesByType(contentType: 'movie' | 'show'): Promise<RouterRule[]>

    /**
     * Creates a new router rule
     * @param rule - Router rule data excluding auto-generated fields
     * @returns Promise resolving to the created router rule
     */
    createRouterRule(rule: Omit<RouterRule, 'id' | 'created_at' | 'updated_at'>): Promise<RouterRule>

    /**
     * Updates an existing router rule
     * @param id - ID of the router rule to update
     * @param updates - Partial router rule data to update
     * @returns Promise resolving to the updated router rule
     */
    updateRouterRule(id: number, updates: Partial<RouterRule>): Promise<RouterRule>

    /**
     * Deletes a router rule by ID
     * @param id - ID of the router rule to delete
     * @returns Promise resolving to true if deleted, false otherwise
     */
    deleteRouterRule(id: number): Promise<boolean>

    /**
     * Retrieves router rules by target instance
     * @param targetId - ID of the target instance
     * @param targetType - Type of target instance
     * @returns Promise resolving to array of matching router rules
     */
    getRouterRulesByTarget(targetId: number, targetType: 'sonarr' | 'radarr'): Promise<RouterRule[]>

    /**
     * Retrieves router rules by target type
     * @param targetType - Type of target instance
     * @returns Promise resolving to array of matching router rules
     */
    getRouterRulesByTargetType(targetType: 'sonarr' | 'radarr'): Promise<RouterRule[]>

    /**
     * Toggles the enabled state of a router rule
     * @param id - ID of the router rule to toggle
     * @param enabled - Whether to enable or disable the rule
     * @returns Promise resolving to the updated router rule
     */
    toggleRouterRule(id: number, enabled: boolean): Promise<RouterRule>

    /**
     * Creates a conditional router rule with condition groups
     * @param rule - Rule data with condition groups
     * @returns Promise resolving to the created router rule
     */
    createConditionalRule(rule: { name: string, target_type: 'sonarr' | 'radarr', target_instance_id: number, condition: Condition | ConditionGroup, root_folder?: string | null, quality_profile?: number | null, order?: number, enabled?: boolean, metadata?: RadarrMovieLookupResponse | SonarrSeriesLookupResponse | null, search_on_add?: boolean, season_monitoring?: string }): Promise<RouterRule>

    /**
     * Updates a conditional router rule
     * @param id - ID of the router rule to update
     * @param updates - Partial updates including condition groups
     * @returns Promise resolving to the updated router rule
     */
    updateConditionalRule(id: number, updates: { name?: string, condition?: Condition | ConditionGroup, target_instance_id?: number, root_folder?: string | null, quality_profile?: number | null, order?: number, enabled?: boolean, metadata?: RadarrMovieLookupResponse | SonarrSeriesLookupResponse | null, search_on_add?: boolean, season_monitoring?: string }): Promise<RouterRule>

    /**
     * Checks if any router rules exist in the database
     * @returns Promise resolving to true if any rules exist, false otherwise
     */
    hasAnyRouterRules(): Promise<boolean>
  }
}