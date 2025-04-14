import type {
  Condition,
  ConditionGroup,
  ComparisonOperator,
  LogicalOperator,
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
    return RuleBuilder.condition('originalLanguage', operator, language, negate)
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
    root_folder?: string
    quality_profile?: number
    order?: number
    enabled?: boolean
  }) {
    return options
  },
}
