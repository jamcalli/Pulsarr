import { describe, expect, it } from 'vitest'
import { RuleBuilder } from '../../../src/utils/rule-builder.js'

describe('rule-builder', () => {
  describe('condition', () => {
    it('should create a basic condition', () => {
      const condition = RuleBuilder.condition('field', 'equals', 'value')

      expect(condition).toEqual({
        field: 'field',
        operator: 'equals',
        value: 'value',
        negate: false,
      })
    })

    it('should create a negated condition', () => {
      const condition = RuleBuilder.condition('field', 'equals', 'value', true)

      expect(condition).toEqual({
        field: 'field',
        operator: 'equals',
        value: 'value',
        negate: true,
      })
    })

    it('should handle numeric values', () => {
      const condition = RuleBuilder.condition('rating', 'greaterThan', 7.5)

      expect(condition).toEqual({
        field: 'rating',
        operator: 'greaterThan',
        value: 7.5,
        negate: false,
      })
    })

    it('should handle array values', () => {
      const condition = RuleBuilder.condition('tags', 'in', ['action', 'drama'])

      expect(condition.value).toEqual(['action', 'drama'])
    })
  })

  describe('genre', () => {
    it('should create a genre condition with single genre', () => {
      const condition = RuleBuilder.genre('Action')

      expect(condition).toEqual({
        field: 'genres',
        operator: 'contains',
        value: 'Action',
        negate: false,
      })
    })

    it('should create a genre condition with multiple genres', () => {
      const condition = RuleBuilder.genre(['Action', 'Comedy'])

      expect(condition).toEqual({
        field: 'genres',
        operator: 'contains',
        value: ['Action', 'Comedy'],
        negate: false,
      })
    })

    it('should create a negated genre condition', () => {
      const condition = RuleBuilder.genre('Horror', 'contains', true)

      expect(condition).toEqual({
        field: 'genres',
        operator: 'contains',
        value: 'Horror',
        negate: true,
      })
    })

    it('should support custom operator', () => {
      const condition = RuleBuilder.genre('Drama', 'equals')

      expect(condition.operator).toBe('equals')
    })
  })

  describe('year', () => {
    it('should create a year condition with specific year', () => {
      const condition = RuleBuilder.year(2024)

      expect(condition).toEqual({
        field: 'year',
        operator: 'equals',
        value: 2024,
        negate: false,
      })
    })

    it('should create a year condition with range', () => {
      const condition = RuleBuilder.year({ min: 2020, max: 2024 })

      expect(condition).toEqual({
        field: 'year',
        operator: 'equals',
        value: { min: 2020, max: 2024 },
        negate: false,
      })
    })

    it('should create a year condition with only min', () => {
      const condition = RuleBuilder.year({ min: 2020 })

      expect(condition.value).toEqual({ min: 2020 })
    })

    it('should create a year condition with only max', () => {
      const condition = RuleBuilder.year({ max: 2024 })

      expect(condition.value).toEqual({ max: 2024 })
    })

    it('should support custom operator', () => {
      const condition = RuleBuilder.year(2024, 'greaterThan')

      expect(condition.operator).toBe('greaterThan')
    })

    it('should create a negated year condition', () => {
      const condition = RuleBuilder.year(2024, 'equals', true)

      expect(condition.negate).toBe(true)
    })
  })

  describe('language', () => {
    it('should create a language condition', () => {
      const condition = RuleBuilder.language('en')

      expect(condition).toEqual({
        field: 'language',
        operator: 'equals',
        value: 'en',
        negate: false,
      })
    })

    it('should create a negated language condition', () => {
      const condition = RuleBuilder.language('en', 'equals', true)

      expect(condition.negate).toBe(true)
    })

    it('should support custom operator', () => {
      const condition = RuleBuilder.language('en', 'contains')

      expect(condition.operator).toBe('contains')
    })
  })

  describe('user', () => {
    it('should create a user condition with single string user', () => {
      const condition = RuleBuilder.user('user123')

      expect(condition).toEqual({
        field: 'user',
        operator: 'in',
        value: 'user123',
        negate: false,
      })
    })

    it('should create a user condition with multiple string users', () => {
      const condition = RuleBuilder.user(['user1', 'user2'])

      expect(condition).toEqual({
        field: 'user',
        operator: 'in',
        value: ['user1', 'user2'],
        negate: false,
      })
    })

    it('should create a user condition with single numeric user', () => {
      const condition = RuleBuilder.user(123)

      expect(condition.value).toBe(123)
    })

    it('should create a user condition with multiple numeric users', () => {
      const condition = RuleBuilder.user([123, 456])

      expect(condition.value).toEqual([123, 456])
    })

    it('should create a negated user condition', () => {
      const condition = RuleBuilder.user('user123', true)

      expect(condition.negate).toBe(true)
    })
  })

  describe('and', () => {
    it('should create an AND group with multiple conditions', () => {
      const group = RuleBuilder.and([
        RuleBuilder.genre('Action'),
        RuleBuilder.year(2024),
      ])

      expect(group).toEqual({
        operator: 'AND',
        conditions: [
          {
            field: 'genres',
            operator: 'contains',
            value: 'Action',
            negate: false,
          },
          {
            field: 'year',
            operator: 'equals',
            value: 2024,
            negate: false,
          },
        ],
        negate: false,
      })
    })

    it('should create a negated AND group', () => {
      const group = RuleBuilder.and(
        [RuleBuilder.genre('Action'), RuleBuilder.year(2024)],
        true,
      )

      expect(group.negate).toBe(true)
    })

    it('should support nested groups', () => {
      const group = RuleBuilder.and([
        RuleBuilder.genre('Action'),
        RuleBuilder.or([RuleBuilder.year(2023), RuleBuilder.year(2024)]),
      ])

      expect(group.conditions).toHaveLength(2)
      expect(group.conditions[1]).toHaveProperty('operator', 'OR')
    })
  })

  describe('or', () => {
    it('should create an OR group with multiple conditions', () => {
      const group = RuleBuilder.or([
        RuleBuilder.genre('Action'),
        RuleBuilder.genre('Comedy'),
      ])

      expect(group).toEqual({
        operator: 'OR',
        conditions: [
          {
            field: 'genres',
            operator: 'contains',
            value: 'Action',
            negate: false,
          },
          {
            field: 'genres',
            operator: 'contains',
            value: 'Comedy',
            negate: false,
          },
        ],
        negate: false,
      })
    })

    it('should create a negated OR group', () => {
      const group = RuleBuilder.or(
        [RuleBuilder.genre('Action'), RuleBuilder.genre('Comedy')],
        true,
      )

      expect(group.negate).toBe(true)
    })

    it('should support nested groups', () => {
      const group = RuleBuilder.or([
        RuleBuilder.and([RuleBuilder.genre('Action'), RuleBuilder.year(2024)]),
        RuleBuilder.genre('Comedy'),
      ])

      expect(group.conditions).toHaveLength(2)
      expect(group.conditions[0]).toHaveProperty('operator', 'AND')
    })
  })

  describe('not', () => {
    it('should negate a condition', () => {
      const condition = RuleBuilder.genre('Action')
      const negated = RuleBuilder.not(condition)

      expect(negated.negate).toBe(true)
    })

    it('should double-negate a condition back to false', () => {
      const condition = RuleBuilder.genre('Action', 'contains', true)
      const doubleNegated = RuleBuilder.not(condition)

      expect(doubleNegated.negate).toBe(false)
    })

    it('should negate a condition group', () => {
      const group = RuleBuilder.and([
        RuleBuilder.genre('Action'),
        RuleBuilder.year(2024),
      ])
      const negated = RuleBuilder.not(group)

      expect(negated.negate).toBe(true)
    })
  })

  describe('createRule', () => {
    it('should create a basic rule with required fields', () => {
      const rule = RuleBuilder.createRule({
        name: 'Action Movies 2024',
        target_type: 'radarr',
        target_instance_id: 1,
        condition: RuleBuilder.genre('Action'),
      })

      expect(rule).toEqual({
        name: 'Action Movies 2024',
        target_type: 'radarr',
        target_instance_id: 1,
        type: 'conditional',
        criteria: {
          condition: {
            field: 'genres',
            operator: 'contains',
            value: 'Action',
            negate: false,
          },
        },
        root_folder: null,
        quality_profile: null,
        tags: [],
        order: 50,
        enabled: true,
        metadata: null,
        search_on_add: undefined,
        season_monitoring: undefined,
        series_type: undefined,
        always_require_approval: undefined,
        bypass_user_quotas: undefined,
        approval_reason: undefined,
      })
    })

    it('should create a rule with all optional fields', () => {
      const rule = RuleBuilder.createRule({
        name: 'Complete Rule',
        target_type: 'sonarr',
        target_instance_id: 2,
        condition: RuleBuilder.genre('Drama'),
        root_folder: '/media/shows',
        quality_profile: 5,
        tags: ['tag1', 'tag2'],
        order: 100,
        enabled: false,
        search_on_add: true,
        season_monitoring: 'all',
        series_type: 'anime',
        always_require_approval: true,
        bypass_user_quotas: true,
        approval_reason: 'Premium content',
      })

      expect(rule.root_folder).toBe('/media/shows')
      expect(rule.quality_profile).toBe(5)
      expect(rule.tags).toEqual(['tag1', 'tag2'])
      expect(rule.order).toBe(100)
      expect(rule.enabled).toBe(false)
      expect(rule.search_on_add).toBe(true)
      expect(rule.season_monitoring).toBe('all')
      expect(rule.series_type).toBe('anime')
      expect(rule.always_require_approval).toBe(true)
      expect(rule.bypass_user_quotas).toBe(true)
      expect(rule.approval_reason).toBe('Premium content')
    })

    it('should create a rule with complex nested conditions', () => {
      const rule = RuleBuilder.createRule({
        name: 'Complex Rule',
        target_type: 'radarr',
        target_instance_id: 1,
        condition: RuleBuilder.and([
          RuleBuilder.or([
            RuleBuilder.genre('Action'),
            RuleBuilder.genre('Thriller'),
          ]),
          RuleBuilder.year({ min: 2020, max: 2024 }),
          RuleBuilder.not(RuleBuilder.language('fr')),
        ]),
      })

      expect(rule.criteria.condition).toHaveProperty('operator', 'AND')
      expect(rule.criteria.condition.conditions).toHaveLength(3)
    })

    it('should use default values for order and enabled', () => {
      const rule = RuleBuilder.createRule({
        name: 'Default Rule',
        target_type: 'radarr',
        target_instance_id: 1,
        condition: RuleBuilder.genre('Action'),
      })

      expect(rule.order).toBe(50)
      expect(rule.enabled).toBe(true)
    })

    it('should set type to conditional', () => {
      const rule = RuleBuilder.createRule({
        name: 'Test Rule',
        target_type: 'radarr',
        target_instance_id: 1,
        condition: RuleBuilder.genre('Action'),
      })

      expect(rule.type).toBe('conditional')
    })

    it('should set metadata to null', () => {
      const rule = RuleBuilder.createRule({
        name: 'Test Rule',
        target_type: 'radarr',
        target_instance_id: 1,
        condition: RuleBuilder.genre('Action'),
      })

      expect(rule.metadata).toBe(null)
    })

    it('should handle sonarr-specific fields', () => {
      const rule = RuleBuilder.createRule({
        name: 'TV Show Rule',
        target_type: 'sonarr',
        target_instance_id: 3,
        condition: RuleBuilder.genre('Drama'),
        season_monitoring: 'future',
        series_type: 'daily',
      })

      expect(rule.target_type).toBe('sonarr')
      expect(rule.season_monitoring).toBe('future')
      expect(rule.series_type).toBe('daily')
    })

    it('should handle empty tags array by default', () => {
      const rule = RuleBuilder.createRule({
        name: 'No Tags Rule',
        target_type: 'radarr',
        target_instance_id: 1,
        condition: RuleBuilder.genre('Action'),
      })

      expect(rule.tags).toEqual([])
    })
  })
})
