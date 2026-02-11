import type { RouterRule } from '@root/types/router.types.js'
import { formatRule } from '@utils/content-router-formatter.js'
import { describe, expect, it } from 'vitest'
import { createMockLogger } from '../../mocks/logger.js'

// Helper to create a mock database row (database returns raw types)
// biome-ignore lint/suspicious/noExplicitAny: Need any to simulate raw database types
function createMockRule(overrides: any): RouterRule {
  return {
    type: 'test',
    target_type: 'radarr',
    target_instance_id: 1,
    order: 1,
    tags: [],
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-02T00:00:00Z',
    enabled: 1,
    criteria: '{}',
    ...overrides,
  } as unknown as RouterRule
}

describe('content-router-formatter', () => {
  describe('formatRule', () => {
    it('should format a complete rule with all fields', () => {
      const rule = createMockRule({
        id: 1,
        name: 'Test Rule',
        target_type: 'radarr',
        target_instance_id: 123,
        root_folder: '/movies',
        quality_profile: 5,
        order: 1,
        enabled: 1,
        criteria: JSON.stringify({ condition: 'test-condition' }),
        tags: ['tag1', 'tag2'],
        search_on_add: true,
        season_monitoring: 'all',
        series_type: 'standard',
        always_require_approval: false,
        bypass_user_quotas: false,
        approval_reason: 'Test reason',
      })

      const result = formatRule(rule)

      expect(result).toEqual({
        id: 1,
        name: 'Test Rule',
        target_type: 'radarr',
        target_instance_id: 123,
        root_folder: '/movies',
        quality_profile: 5,
        order: 1,
        enabled: true,
        condition: 'test-condition',
        tags: ['tag1', 'tag2'],
        search_on_add: true,
        season_monitoring: 'all',
        series_type: 'standard',
        always_require_approval: false,
        bypass_user_quotas: false,
        approval_reason: 'Test reason',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-02T00:00:00Z',
      })
    })

    it('should handle criteria as object', () => {
      const rule = createMockRule({
        id: 2,
        name: 'Object Criteria',
        target_type: 'sonarr',
        target_instance_id: 456,
        criteria: { condition: 'object-condition' } as unknown as string,
      })

      const result = formatRule(rule)

      expect(result.condition).toBe('object-condition')
    })

    it('should handle null quality_profile as undefined', () => {
      const rule = createMockRule({
        id: 3,
        name: 'Null Quality',
        quality_profile: null,
      })

      const result = formatRule(rule)

      expect(result.quality_profile).toBeUndefined()
    })

    it('should handle null root_folder as undefined', () => {
      const rule = createMockRule({
        id: 4,
        name: 'Null Root Folder',
        root_folder: null,
      })

      const result = formatRule(rule)

      expect(result.root_folder).toBeUndefined()
    })

    it('should handle empty root_folder as undefined', () => {
      const rule = createMockRule({
        id: 5,
        name: 'Empty Root Folder',
        root_folder: '',
      })

      const result = formatRule(rule)

      expect(result.root_folder).toBeUndefined()
    })

    it('should convert enabled to boolean (truthy)', () => {
      const rule = createMockRule({
        id: 6,
        name: 'Enabled Rule',
        enabled: 1,
      })

      const result = formatRule(rule)

      expect(result.enabled).toBe(true)
    })

    it('should convert enabled to boolean (falsy)', () => {
      const rule = createMockRule({
        id: 7,
        name: 'Disabled Rule',
        enabled: 0,
      })

      const result = formatRule(rule)

      expect(result.enabled).toBe(false)
    })

    it('should handle non-array tags as empty array', () => {
      const rule = createMockRule({
        id: 8,
        name: 'Invalid Tags',
        tags: null as unknown as string[],
      })

      const result = formatRule(rule)

      expect(result.tags).toEqual([])
    })

    it('should handle null search_on_add as undefined', () => {
      const rule = createMockRule({
        id: 9,
        name: 'Null Search',
        target_type: 'sonarr',
        search_on_add: null,
      })

      const result = formatRule(rule)

      expect(result.search_on_add).toBeUndefined()
    })

    it('should handle undefined search_on_add as undefined', () => {
      const rule = createMockRule({
        id: 10,
        name: 'Undefined Search',
        target_type: 'sonarr',
        search_on_add: undefined,
      })

      const result = formatRule(rule)

      expect(result.search_on_add).toBeUndefined()
    })

    it('should convert search_on_add to boolean when present', () => {
      const rule = createMockRule({
        id: 11,
        name: 'Search On Add',
        target_type: 'sonarr',
        search_on_add: false,
      })

      const result = formatRule(rule)

      expect(result.search_on_add).toBe(false)
    })

    it('should handle null season_monitoring as undefined', () => {
      const rule = createMockRule({
        id: 12,
        name: 'Null Season',
        target_type: 'sonarr',
        season_monitoring: null,
      })

      const result = formatRule(rule)

      expect(result.season_monitoring).toBeUndefined()
    })

    it('should handle null series_type as undefined', () => {
      const rule = createMockRule({
        id: 13,
        name: 'Null Series Type',
        target_type: 'sonarr',
        series_type: null,
      })

      const result = formatRule(rule)

      expect(result.series_type).toBeUndefined()
    })

    it('should default always_require_approval to false when null', () => {
      const rule = createMockRule({
        id: 14,
        name: 'Null Approval',
        always_require_approval: null,
      })

      const result = formatRule(rule)

      expect(result.always_require_approval).toBe(false)
    })

    it('should default bypass_user_quotas to false when null', () => {
      const rule = createMockRule({
        id: 15,
        name: 'Null Bypass',
        bypass_user_quotas: null,
      })

      const result = formatRule(rule)

      expect(result.bypass_user_quotas).toBe(false)
    })

    it('should handle null approval_reason as undefined', () => {
      const rule = createMockRule({
        id: 16,
        name: 'Null Reason',
        approval_reason: null,
      })

      const result = formatRule(rule)

      expect(result.approval_reason).toBeUndefined()
    })

    it('should handle empty approval_reason as undefined', () => {
      const rule = createMockRule({
        id: 17,
        name: 'Empty Reason',
        approval_reason: '',
      })

      const result = formatRule(rule)

      expect(result.approval_reason).toBeUndefined()
    })

    it('should handle invalid JSON criteria and log error', () => {
      const mockLogger = createMockLogger()
      const rule = createMockRule({
        id: 18,
        name: 'Invalid JSON',
        criteria: 'invalid json',
      })

      const result = formatRule(rule, mockLogger)

      expect(result.condition).toBeUndefined()
    })

    it('should handle invalid JSON criteria without logger', () => {
      const rule = createMockRule({
        id: 19,
        name: 'Invalid JSON No Logger',
        criteria: 'invalid json',
      })

      const result = formatRule(rule)

      expect(result.condition).toBeUndefined()
      expect(result.id).toBe(19)
    })

    it('should handle null criteria as empty object', () => {
      const rule = createMockRule({
        id: 20,
        name: 'Null Criteria',
        criteria: null as unknown as string,
      })

      const result = formatRule(rule)

      expect(result.condition).toBeUndefined()
    })

    it('should handle empty string criteria as empty object', () => {
      const rule = createMockRule({
        id: 21,
        name: 'Empty Criteria',
        criteria: '',
      })

      const result = formatRule(rule)

      expect(result.condition).toBeUndefined()
    })

    it('should extract condition from nested criteria', () => {
      const rule = createMockRule({
        id: 22,
        name: 'Nested Condition',
        criteria: JSON.stringify({
          condition: 'complex-condition',
          other: 'data',
        }),
      })

      const result = formatRule(rule)

      expect(result.condition).toBe('complex-condition')
    })

    it('should preserve all other rule fields on error', () => {
      const mockLogger = createMockLogger()
      const rule = createMockRule({
        id: 23,
        name: 'Error Preservation',
        target_type: 'sonarr',
        target_instance_id: 999,
        root_folder: '/tv',
        quality_profile: 10,
        criteria: '{invalid',
        tags: ['error-test'],
        search_on_add: true,
        season_monitoring: 'future',
        series_type: 'anime',
        always_require_approval: true,
        bypass_user_quotas: true,
        approval_reason: 'Test',
      })

      const result = formatRule(rule, mockLogger)

      expect(result.id).toBe(23)
      expect(result.name).toBe('Error Preservation')
      expect(result.target_type).toBe('sonarr')
      expect(result.target_instance_id).toBe(999)
      expect(result.root_folder).toBe('/tv')
      expect(result.quality_profile).toBe(10)
      expect(result.order).toBe(1)
      expect(result.enabled).toBe(true)
      expect(result.condition).toBeUndefined()
      expect(result.tags).toEqual(['error-test'])
      expect(result.search_on_add).toBe(true)
      expect(result.season_monitoring).toBe('future')
      expect(result.series_type).toBe('anime')
      expect(result.always_require_approval).toBe(true)
      expect(result.bypass_user_quotas).toBe(true)
      expect(result.approval_reason).toBe('Test')
    })
  })
})
