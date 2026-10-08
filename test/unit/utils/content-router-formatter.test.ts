import type { RouterRule } from '@root/types/router.types.js'
import { formatRule } from '@utils/content-router-formatter.js'
import { describe, expect, it } from 'vitest'

function createRule(overrides: Partial<RouterRule> = {}): RouterRule {
  return {
    id: 1,
    name: 'Test Rule',
    type: 'conditional',
    criteria: {
      condition: { field: 'genre', operator: 'equals', value: 'Action' },
    },
    target_type: 'radarr',
    target_instance_id: 1,
    order: 1,
    enabled: true,
    tags: [],
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-02T00:00:00Z',
    ...overrides,
  }
}

describe('content-router-formatter', () => {
  describe('formatRule', () => {
    it('should format a complete rule with all fields', () => {
      const rule = createRule({
        target_instance_id: 123,
        root_folder: '/movies',
        quality_profile: 5,
        tags: ['tag1', 'tag2'],
        search_on_add: true,
        season_monitoring: 'all',
        series_type: 'standard',
        monitor: 'movieAndCollection',
        always_require_approval: false,
        bypass_user_quotas: false,
        approval_reason: 'Test reason',
        exclude_from_routing: false,
      })

      expect(formatRule(rule)).toEqual({
        id: 1,
        name: 'Test Rule',
        target_type: 'radarr',
        target_instance_id: 123,
        root_folder: '/movies',
        quality_profile: 5,
        order: 1,
        enabled: true,
        condition: { field: 'genre', operator: 'equals', value: 'Action' },
        tags: ['tag1', 'tag2'],
        search_on_add: true,
        season_monitoring: 'all',
        series_type: 'standard',
        monitor: 'movieAndCollection',
        always_require_approval: false,
        bypass_user_quotas: false,
        approval_reason: 'Test reason',
        exclude_from_routing: false,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-02T00:00:00Z',
      })
    })

    it.each([
      'root_folder',
      'quality_profile',
      'search_on_add',
      'season_monitoring',
      'series_type',
      'monitor',
    ] as const)('should carry a null %s as null', (field) => {
      expect(formatRule(createRule({ [field]: null }))[field]).toBeNull()
    })

    it.each([
      'root_folder',
      'quality_profile',
      'search_on_add',
      'season_monitoring',
      'series_type',
      'monitor',
    ] as const)('should report an absent %s as null', (field) => {
      expect(formatRule(createRule())[field]).toBeNull()
    })

    it('should report a legacy empty root_folder as null', () => {
      expect(formatRule(createRule({ root_folder: '' })).root_folder).toBeNull()
    })

    it('should keep a false search_on_add', () => {
      expect(
        formatRule(createRule({ search_on_add: false })).search_on_add,
      ).toBe(false)
    })

    it('should report absent tags as an empty list', () => {
      expect(formatRule(createRule({ tags: undefined })).tags).toEqual([])
    })

    it('should default the action flags to false when absent', () => {
      const result = formatRule(createRule())

      expect(result.always_require_approval).toBe(false)
      expect(result.bypass_user_quotas).toBe(false)
      expect(result.exclude_from_routing).toBe(false)
    })

    it('should handle null criteria as empty object', () => {
      const result = formatRule(
        createRule({ criteria: null as unknown as RouterRule['criteria'] }),
      )

      expect(result.condition).toBeUndefined()
      expect(result.id).toBe(1)
      expect(result.name).toBe('Test Rule')
      expect(result.target_type).toBe('radarr')
      expect(result.enabled).toBe(true)
    })

    it.each([null, ''])(
      'should report approval_reason %j as undefined',
      (approvalReason) => {
        const rule = createRule({ approval_reason: approvalReason })

        expect(formatRule(rule).approval_reason).toBeUndefined()
      },
    )
  })
})
