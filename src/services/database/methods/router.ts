import type { DatabaseService } from '@services/database.service.js'
import type {
  RouterRule,
  Condition,
  ConditionGroup,
} from '@root/types/router.types.js'
import type {
  RadarrMovieLookupResponse,
  SonarrSeriesLookupResponse,
} from '@root/types/content-lookup.types.js'

/**
 * Retrieves all router rules
 *
 * @returns Promise resolving to array of all router rules
 */
export async function getAllRouterRules(
  this: DatabaseService,
): Promise<RouterRule[]> {
  const rules = await this.knex('router_rules')
    .select('*')
    .orderBy('order', 'desc')
    .orderBy('id', 'asc')

  return rules.map((rule) => this.formatRouterRule(rule))
}

/**
 * Retrieves a router rule by ID
 *
 * @param id - ID of the router rule to retrieve
 * @returns Promise resolving to the router rule if found, null otherwise
 */
export async function getRouterRuleById(
  this: DatabaseService,
  id: number,
): Promise<RouterRule | null> {
  const rule = await this.knex('router_rules').where('id', id).first()

  if (!rule) return null

  return this.formatRouterRule(rule)
}

/**
 * Retrieves all router rules of a specific type
 *
 * @param type - Type of router rules to retrieve (e.g., 'genre', 'user')
 * @param enabledOnly - Whether to retrieve only enabled rules (default: true)
 * @returns Promise resolving to array of matching router rules
 */
export async function getRouterRulesByType(
  this: DatabaseService,
  type: string,
  enabledOnly = true,
): Promise<RouterRule[]> {
  const query = this.knex('router_rules').select('*').where('type', type)

  if (enabledOnly) {
    query.where('enabled', true)
  }

  const rules = await query.orderBy('order', 'desc').orderBy('id', 'asc')

  return rules.map((rule) => this.formatRouterRule(rule))
}

/**
 * Creates a new router rule
 *
 * @param rule - Router rule data excluding ID and timestamps
 * @returns Promise resolving to the created router rule
 */
export async function createRouterRule(
  this: DatabaseService,
  rule: Omit<RouterRule, 'id' | 'created_at' | 'updated_at'>,
): Promise<RouterRule> {
  const insertData = {
    ...rule,
    criteria: JSON.stringify(rule.criteria),
    tags: rule.tags ? JSON.stringify(rule.tags) : JSON.stringify([]),
    metadata: rule.metadata ? JSON.stringify(rule.metadata) : null,
    created_at: this.timestamp,
    updated_at: this.timestamp,
  }

  const [createdRule] = await this.knex('router_rules')
    .insert(insertData)
    .returning('*')

  if (!createdRule) throw new Error('Failed to create router rule')

  return this.formatRouterRule(createdRule)
}

/**
 * Updates an existing router rule
 *
 * @param id - ID of the router rule to update
 * @param updates - Partial router rule data to update
 * @returns Promise resolving to the updated router rule
 */
export async function updateRouterRule(
  this: DatabaseService,
  id: number,
  updates: Partial<Omit<RouterRule, 'id' | 'created_at' | 'updated_at'>>,
): Promise<RouterRule> {
  const updateData: Record<string, unknown> = {
    updated_at: this.timestamp,
  }

  // Explicitly whitelist allowed columns to prevent schema drift
  if (updates.name !== undefined) {
    updateData.name = updates.name
  }

  if (updates.type !== undefined) {
    updateData.type = updates.type
  }

  if (updates.criteria !== undefined) {
    updateData.criteria = JSON.stringify(updates.criteria)
  }

  if (updates.target_type !== undefined) {
    updateData.target_type = updates.target_type
  }

  if (updates.target_instance_id !== undefined) {
    updateData.target_instance_id = updates.target_instance_id
  }

  if (updates.root_folder !== undefined) {
    updateData.root_folder = updates.root_folder
  }

  if (updates.quality_profile !== undefined) {
    updateData.quality_profile = updates.quality_profile
  }

  if (updates.tags !== undefined) {
    updateData.tags = JSON.stringify(updates.tags || [])
  }

  if (updates.order !== undefined) {
    updateData.order = updates.order
  }

  if (updates.enabled !== undefined) {
    updateData.enabled = updates.enabled
  }

  if (updates.metadata !== undefined) {
    updateData.metadata = updates.metadata
      ? JSON.stringify(updates.metadata)
      : null
  }

  if (updates.search_on_add !== undefined) {
    updateData.search_on_add = updates.search_on_add
  }

  if (updates.season_monitoring !== undefined) {
    updateData.season_monitoring = updates.season_monitoring
  }

  if (updates.series_type !== undefined) {
    updateData.series_type = updates.series_type
  }

  const [updatedRule] = await this.knex('router_rules')
    .where('id', id)
    .update(updateData)
    .returning('*')

  if (!updatedRule) {
    throw new Error(
      `Router rule with ID ${id} not found or could not be updated`,
    )
  }

  return this.formatRouterRule(updatedRule)
}

/**
 * Deletes a router rule
 *
 * @param id - ID of the router rule to delete
 * @returns Promise resolving to true if deleted, false otherwise
 */
export async function deleteRouterRule(
  this: DatabaseService,
  id: number,
): Promise<boolean> {
  const deleted = await this.knex('router_rules').where('id', id).delete()
  return deleted > 0
}

/**
 * Retrieves router rules by target type and instance
 *
 * @param targetType - Target type ('sonarr' or 'radarr')
 * @param instanceId - ID of the target instance
 * @returns Promise resolving to array of matching router rules
 */
export async function getRouterRulesByTarget(
  this: DatabaseService,
  targetType: 'sonarr' | 'radarr',
  instanceId: number,
): Promise<RouterRule[]> {
  const rules = await this.knex('router_rules')
    .select('*')
    .where({
      target_type: targetType,
      target_instance_id: instanceId,
      enabled: true,
    })
    .orderBy('order', 'desc')
    .orderBy('id', 'asc')

  return rules.map((rule) => this.formatRouterRule(rule))
}

/**
 * Retrieves router rules filtered by target type ('sonarr' or 'radarr')
 *
 * @param targetType - The target type ('sonarr' or 'radarr')
 * @returns Promise resolving to array of matching router rules
 */
export async function getRouterRulesByTargetType(
  this: DatabaseService,
  targetType: 'sonarr' | 'radarr',
): Promise<RouterRule[]> {
  try {
    const rules = await this.knex('router_rules')
      .select('*')
      .where('target_type', targetType)
      .orderBy('order', 'desc')
      .orderBy('id', 'asc')

    this.log.debug(
      `Found ${rules.length} router rules for target type: ${targetType}`,
    )

    return rules.map((rule) => this.formatRouterRule(rule))
  } catch (error) {
    this.log.error(
      `Error fetching router rules by target type ${targetType}:`,
      error,
    )
    throw error
  }
}

/**
 * Toggles the enabled state of a router rule
 *
 * @param id - ID of the router rule to toggle
 * @param enabled - New enabled state (true to enable, false to disable)
 * @returns Promise resolving to the updated router rule
 */
export async function toggleRouterRule(
  this: DatabaseService,
  id: number,
  enabled: boolean,
): Promise<RouterRule> {
  const [updatedRule] = await this.knex('router_rules')
    .where('id', id)
    .update({
      enabled,
      updated_at: this.timestamp,
    })
    .returning('*')

  if (!updatedRule) {
    throw new Error(
      `Router rule with ID ${id} not found or could not be updated`,
    )
  }

  return this.formatRouterRule(updatedRule)
}

/**
 * Creates a conditional router rule
 *
 * @param rule - Rule data with condition groups
 * @returns Promise resolving to the created router rule
 */
export async function createConditionalRule(
  this: DatabaseService,
  rule: {
    name: string
    target_type: 'sonarr' | 'radarr'
    target_instance_id: number
    condition: Condition | ConditionGroup
    root_folder?: string | null
    quality_profile?: number | null
    order?: number
    enabled?: boolean
    metadata?: RadarrMovieLookupResponse | SonarrSeriesLookupResponse | null
    search_on_add?: boolean
    season_monitoring?: string
  },
): Promise<RouterRule> {
  // Validate condition before proceeding
  const validationResult = this.validateCondition(rule.condition)
  if (!validationResult.valid) {
    throw new Error(`Invalid condition: ${validationResult.error}`)
  }

  const criteria = {
    condition: rule.condition,
  }

  const insertData = {
    name: rule.name,
    type: 'conditional',
    criteria: JSON.stringify(criteria),
    target_type: rule.target_type,
    target_instance_id: rule.target_instance_id,
    root_folder: rule.root_folder,
    quality_profile: rule.quality_profile,
    order: rule.order ?? 50,
    enabled: rule.enabled ?? true,
    metadata: rule.metadata ? JSON.stringify(rule.metadata) : null,
    search_on_add: rule.search_on_add,
    season_monitoring: rule.season_monitoring,
    created_at: this.timestamp,
    updated_at: this.timestamp,
  }

  const [createdRule] = await this.knex('router_rules')
    .insert(insertData)
    .returning('*')

  if (!createdRule) throw new Error('Failed to create router rule')

  return this.formatRouterRule(createdRule)
}

/**
 * Updates a conditional router rule
 *
 * @param id - ID of the router rule to update
 * @param updates - Partial updates including condition groups
 * @returns Promise resolving to the updated router rule
 */
export async function updateConditionalRule(
  this: DatabaseService,
  id: number,
  updates: {
    name?: string
    condition?: Condition | ConditionGroup
    target_instance_id?: number
    root_folder?: string | null
    quality_profile?: number | null
    order?: number
    enabled?: boolean
    metadata?: RadarrMovieLookupResponse | SonarrSeriesLookupResponse | null
    search_on_add?: boolean
    season_monitoring?: string
  },
): Promise<RouterRule> {
  // Validate condition if provided
  if (updates.condition) {
    const validationResult = this.validateCondition(updates.condition)
    if (!validationResult.valid) {
      throw new Error(`Invalid condition: ${validationResult.error}`)
    }
  }

  // Get current rule to preserve existing data
  const currentRule = await this.getRouterRuleById(id)
  if (!currentRule) {
    throw new Error(`Router rule with ID ${id} not found`)
  }

  const updateData: Record<string, unknown> = {
    updated_at: this.timestamp,
  }

  // Update basic fields
  if (updates.name !== undefined) updateData.name = updates.name
  if (updates.target_instance_id !== undefined)
    updateData.target_instance_id = updates.target_instance_id
  if (updates.root_folder !== undefined)
    updateData.root_folder = updates.root_folder
  if (updates.quality_profile !== undefined)
    updateData.quality_profile = updates.quality_profile
  if (updates.order !== undefined) updateData.order = updates.order
  if (updates.enabled !== undefined) updateData.enabled = updates.enabled
  if (updates.search_on_add !== undefined)
    updateData.search_on_add = updates.search_on_add
  if (updates.season_monitoring !== undefined)
    updateData.season_monitoring = updates.season_monitoring

  // Update condition within criteria, preserving other criteria fields
  if (updates.condition !== undefined) {
    const currentCriteria =
      typeof currentRule.criteria === 'string'
        ? this.safeJsonParse(currentRule.criteria, {}, 'router_rule.criteria')
        : currentRule.criteria

    const newCriteria = {
      ...currentCriteria,
      condition: updates.condition,
    }

    updateData.criteria = JSON.stringify(newCriteria)
  }

  // Update metadata
  if (updates.metadata !== undefined) {
    updateData.metadata = updates.metadata
      ? JSON.stringify(updates.metadata)
      : null
  }

  const [updatedRule] = await this.knex('router_rules')
    .where('id', id)
    .update(updateData)
    .returning('*')

  if (!updatedRule) {
    throw new Error(
      `Router rule with ID ${id} not found or could not be updated`,
    )
  }

  return this.formatRouterRule(updatedRule)
}

/**
 * Checks if any enabled router rules exist in the database.
 *
 * This method is used as an optimization to skip router evaluation logic
 * when no rules are defined. It performs a quick count query on the router_rules
 * table, filtering for enabled rules.
 *
 * @returns Promise resolving to a boolean indicating whether any enabled rules exist
 */
export async function hasAnyRouterRules(
  this: DatabaseService,
): Promise<boolean> {
  try {
    // Perform a fast count query to check if any enabled rules exist
    const result = await this.knex('router_rules')
      .where(function () {
        this.where('enabled', true).orWhereNull('enabled')
      })
      .count('* as count')
      .first()

    // Check if count is greater than 0
    return Number(result?.count || 0) > 0
  } catch (error) {
    this.log.error('Error checking for router rules:', error)

    // In case of error, assume rules might exist to be safe
    // This is more conservative than skipping evaluation on error
    return true
  }
}

/**
 * Checks if any router rules exist that require metadata enrichment
 * Only rules with conditions that need API metadata should trigger enrichment
 *
 * @returns Promise resolving to true if metadata-requiring rules exist
 */
export async function hasMetadataRequiringRules(
  this: DatabaseService,
): Promise<boolean> {
  try {
    // Check for rules with conditions that require metadata from Radarr/Sonarr APIs
    // These field types need enriched metadata: year, certification, language, season
    const result = await this.knex('router_rules')
      .where(function () {
        this.where('enabled', true).orWhereNull('enabled')
      })
      .where(function () {
        // Check if conditions contain fields that require metadata
        // Use database-specific JSON queries
        if (this.client.config.client === 'pg') {
          // PostgreSQL JSONB queries
          this.whereRaw('conditions::text LIKE \'%"field":"year"%\'')
            .orWhereRaw('conditions::text LIKE \'%"field":"certification"%\'')
            .orWhereRaw('conditions::text LIKE \'%"field":"language"%\'')
            .orWhereRaw('conditions::text LIKE \'%"field":"season"%\'')
        } else {
          // SQLite JSON queries
          this.whereRaw(
            'json_extract(conditions, \'$\') LIKE \'%"field":"year"%\'',
          )
            .orWhereRaw(
              'json_extract(conditions, \'$\') LIKE \'%"field":"certification"%\'',
            )
            .orWhereRaw(
              'json_extract(conditions, \'$\') LIKE \'%"field":"language"%\'',
            )
            .orWhereRaw(
              'json_extract(conditions, \'$\') LIKE \'%"field":"season"%\'',
            )
        }
      })
      .count('* as count')
      .first()

    return Number(result?.count || 0) > 0
  } catch (error) {
    this.log.error('Error checking for metadata-requiring router rules:', error)

    // In case of error, assume metadata might be needed to be safe
    return true
  }
}
