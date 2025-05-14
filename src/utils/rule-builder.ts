import type {
  Condition,
  ConditionGroup,
  ComparisonOperator,
  LogicalOperator,
  RouterRule,
} from '@root/types/router.types.js'

/**
 * Utility functions for building complex routing conditions
 */
export const RuleBuilder = {
  /**
   * Create a condition
   */
  condition(
    field: string,
    operator: ComparisonOperator,
    value: unknown,
    negate = false,
  ): Condition {
    return {
      field,
      operator,
      value,
      negate,
    }
  },

  /**
   * Create a genre condition
   */
  genre(
    genres: string | string[],
    operator: ComparisonOperator = 'contains',
    negate = false,
  ): Condition {
    return RuleBuilder.condition('genres', operator, genres, negate)
  },

  /**
   * Create a year condition
   */
  year(
    year: number | { min?: number; max?: number },
    operator: ComparisonOperator = 'equals',
    negate = false,
  ): Condition {
    return RuleBuilder.condition('year', operator, year, negate)
  },

  /**
   * Create a language condition
   */
  language(
    language: string,
    operator: ComparisonOperator = 'equals',
    negate = false,
  ): Condition {
    return RuleBuilder.condition('language', operator, language, negate)
  },

  /**
   * Create a user condition
   */
  user(
    users: string | string[] | number | number[],
    negate = false,
  ): Condition {
    return RuleBuilder.condition('user', 'in', users, negate)
  },

  /**
   * Create an AND group
   */
  and(
    conditions: Array<Condition | ConditionGroup>,
    negate = false,
  ): ConditionGroup {
    return {
      operator: 'AND',
      conditions,
      negate,
    }
  },

  /**
   * Create an OR group
   */
  or(
    conditions: Array<Condition | ConditionGroup>,
    negate = false,
  ): ConditionGroup {
    return {
      operator: 'OR',
      conditions,
      negate,
    }
  },

  /**
   * Negate a condition
   */
  not(condition: Condition | ConditionGroup): Condition | ConditionGroup {
    return {
      ...condition,
      negate: !condition.negate,
    }
  },

  /**
   * Create a complete rule
   */
  createRule(options: {
    name: string
    target_type: 'sonarr' | 'radarr'
    target_instance_id: number
    condition: Condition | ConditionGroup
    root_folder?: string | null
    quality_profile?: number | null
    tags?: string[]
    order?: number
    enabled?: boolean
    search_on_add?: boolean | null
    season_monitoring?: string | null
    series_type?: 'standard' | 'anime' | 'daily' | null
  }): Omit<RouterRule, 'id' | 'created_at' | 'updated_at'> {
    const {
      condition,
      order = 50,
      enabled = true,
      root_folder = null,
      quality_profile = null,
      tags = [],
      search_on_add,
      season_monitoring,
      series_type,
      ...rest
    } = options

    return {
      ...rest,
      root_folder,
      quality_profile,
      tags,
      order,
      enabled,
      type: 'conditional',
      criteria: { condition },
      metadata: null,
      search_on_add,
      season_monitoring,
      series_type,
    }
  },
}
