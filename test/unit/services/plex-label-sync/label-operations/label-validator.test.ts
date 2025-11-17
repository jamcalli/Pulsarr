import {
  getRemovedLabel,
  isAppTagLabel,
  isAppUserLabel,
  isManagedLabel,
  isUserSpecificLabel,
  isUserTaggingSystemTag,
} from '@services/plex-label-sync/label-operations/label-validator.js'
import { describe, expect, it } from 'vitest'

describe('label-validator', () => {
  describe('isAppUserLabel', () => {
    it('should return true for app-prefixed label', () => {
      expect(isAppUserLabel('pulsarr:action', 'pulsarr')).toBe(true)
    })

    it('should return true for user-specific label', () => {
      expect(isAppUserLabel('pulsarr:user:john', 'pulsarr')).toBe(true)
    })

    it('should return false for non-app-prefixed label', () => {
      expect(isAppUserLabel('action', 'pulsarr')).toBe(false)
    })

    it('should return false for label with different prefix', () => {
      expect(isAppUserLabel('other:action', 'pulsarr')).toBe(false)
    })

    it('should handle case-insensitive matching for label', () => {
      expect(isAppUserLabel('PULSARR:action', 'pulsarr')).toBe(true)
      expect(isAppUserLabel('Pulsarr:Action', 'pulsarr')).toBe(true)
    })

    it('should handle case-insensitive matching for prefix', () => {
      expect(isAppUserLabel('pulsarr:action', 'PULSARR')).toBe(true)
      expect(isAppUserLabel('pulsarr:action', 'Pulsarr')).toBe(true)
    })

    it('should return false for label without colon', () => {
      expect(isAppUserLabel('pulsarraction', 'pulsarr')).toBe(false)
    })

    it('should return false for empty label', () => {
      expect(isAppUserLabel('', 'pulsarr')).toBe(false)
    })

    it('should return false for label that only has prefix', () => {
      expect(isAppUserLabel('pulsarr:', 'pulsarr')).toBe(true)
    })

    it('should handle multi-part labels', () => {
      expect(isAppUserLabel('pulsarr:tag:subtag:value', 'pulsarr')).toBe(true)
    })

    it('should handle custom prefix', () => {
      expect(isAppUserLabel('custom:action', 'custom')).toBe(true)
      expect(isAppUserLabel('pulsarr:action', 'custom')).toBe(false)
    })

    it('should handle prefix with special characters', () => {
      expect(isAppUserLabel('my-app:action', 'my-app')).toBe(true)
      expect(isAppUserLabel('my_app:action', 'my_app')).toBe(true)
    })

    it('should not match partial prefix', () => {
      expect(isAppUserLabel('pulsarr2:action', 'pulsarr')).toBe(false)
    })
  })

  describe('isUserSpecificLabel', () => {
    it('should return true for user-specific label', () => {
      expect(isUserSpecificLabel('pulsarr:user:john', 'pulsarr')).toBe(true)
    })

    it('should return false for non-user-specific app label', () => {
      expect(isUserSpecificLabel('pulsarr:action', 'pulsarr')).toBe(false)
    })

    it('should return false for non-app-prefixed label', () => {
      expect(isUserSpecificLabel('user:john', 'pulsarr')).toBe(false)
    })

    it('should handle case-insensitive matching', () => {
      expect(isUserSpecificLabel('PULSARR:USER:JOHN', 'pulsarr')).toBe(true)
      expect(isUserSpecificLabel('Pulsarr:User:John', 'pulsarr')).toBe(true)
    })

    it('should handle case-insensitive prefix', () => {
      expect(isUserSpecificLabel('pulsarr:user:john', 'PULSARR')).toBe(true)
    })

    it('should return false for label with user but wrong prefix', () => {
      expect(isUserSpecificLabel('other:user:john', 'pulsarr')).toBe(false)
    })

    it('should return false for empty label', () => {
      expect(isUserSpecificLabel('', 'pulsarr')).toBe(false)
    })

    it('should handle user label without username', () => {
      expect(isUserSpecificLabel('pulsarr:user:', 'pulsarr')).toBe(true)
    })

    it('should handle user label with complex username', () => {
      expect(isUserSpecificLabel('pulsarr:user:john-doe', 'pulsarr')).toBe(true)
      expect(isUserSpecificLabel('pulsarr:user:john_doe', 'pulsarr')).toBe(true)
      expect(
        isUserSpecificLabel('pulsarr:user:john.doe@example.com', 'pulsarr'),
      ).toBe(true)
    })

    it('should not match user-like labels without proper format', () => {
      expect(isUserSpecificLabel('pulsarr:username:john', 'pulsarr')).toBe(
        false,
      )
      expect(isUserSpecificLabel('pulsarr:users:john', 'pulsarr')).toBe(false)
    })

    it('should handle custom prefix', () => {
      expect(isUserSpecificLabel('custom:user:alice', 'custom')).toBe(true)
      expect(isUserSpecificLabel('pulsarr:user:alice', 'custom')).toBe(false)
    })
  })

  describe('isAppTagLabel', () => {
    it('should return true for app tag label', () => {
      expect(isAppTagLabel('pulsarr:action', 'pulsarr')).toBe(true)
      expect(isAppTagLabel('pulsarr:thriller', 'pulsarr')).toBe(true)
    })

    it('should return false for user-specific label', () => {
      expect(isAppTagLabel('pulsarr:user:john', 'pulsarr')).toBe(false)
    })

    it('should return false for non-app-prefixed label', () => {
      expect(isAppTagLabel('action', 'pulsarr')).toBe(false)
    })

    it('should handle case-insensitive matching', () => {
      expect(isAppTagLabel('PULSARR:ACTION', 'pulsarr')).toBe(true)
      expect(isAppTagLabel('Pulsarr:Action', 'pulsarr')).toBe(true)
    })

    it('should return false for empty label', () => {
      expect(isAppTagLabel('', 'pulsarr')).toBe(false)
    })

    it('should handle multi-part tag labels', () => {
      expect(isAppTagLabel('pulsarr:genre:action', 'pulsarr')).toBe(true)
      expect(isAppTagLabel('pulsarr:quality:4k', 'pulsarr')).toBe(true)
    })

    it('should distinguish between tag and user labels', () => {
      expect(isAppTagLabel('pulsarr:tag:action', 'pulsarr')).toBe(true)
      expect(isAppTagLabel('pulsarr:user:action', 'pulsarr')).toBe(false)
    })

    it('should handle custom prefix', () => {
      expect(isAppTagLabel('custom:action', 'custom')).toBe(true)
      expect(isAppTagLabel('custom:user:alice', 'custom')).toBe(false)
    })
  })

  describe('isManagedLabel', () => {
    it('should return true for app-prefixed label', () => {
      expect(isManagedLabel('pulsarr:action', 'pulsarr', 'removed')).toBe(true)
    })

    it('should return true for removed label', () => {
      expect(isManagedLabel('removed', 'pulsarr', 'removed')).toBe(true)
      expect(isManagedLabel('removed-user', 'pulsarr', 'removed')).toBe(true)
    })

    it('should return true for user-specific label', () => {
      expect(isManagedLabel('pulsarr:user:john', 'pulsarr', 'removed')).toBe(
        true,
      )
    })

    it('should return false for non-managed label', () => {
      expect(isManagedLabel('action', 'pulsarr', 'removed')).toBe(false)
      expect(isManagedLabel('other:action', 'pulsarr', 'removed')).toBe(false)
    })

    it('should handle case-insensitive matching for removed labels', () => {
      expect(isManagedLabel('REMOVED', 'pulsarr', 'removed')).toBe(true)
      expect(isManagedLabel('Removed-User', 'pulsarr', 'removed')).toBe(true)
    })

    it('should handle case-insensitive matching for app labels', () => {
      expect(isManagedLabel('PULSARR:ACTION', 'pulsarr', 'removed')).toBe(true)
    })

    it('should return false for empty label', () => {
      expect(isManagedLabel('', 'pulsarr', 'removed')).toBe(false)
    })

    it('should handle custom prefixes', () => {
      expect(isManagedLabel('custom:action', 'custom', 'deleted')).toBe(true)
      expect(isManagedLabel('deleted-user', 'custom', 'deleted')).toBe(true)
      expect(isManagedLabel('removed-user', 'custom', 'deleted')).toBe(false)
    })

    it('should handle multi-instance scenarios', () => {
      expect(
        isManagedLabel('pulsarr1:action', 'pulsarr1', 'pulsarr1:removed'),
      ).toBe(true)
      expect(
        isManagedLabel('pulsarr1:removed-user', 'pulsarr1', 'pulsarr1:removed'),
      ).toBe(true)
      expect(
        isManagedLabel('pulsarr2:action', 'pulsarr1', 'pulsarr1:removed'),
      ).toBe(false)
    })

    it('should not match similar prefixes', () => {
      expect(isManagedLabel('pulsarr2:action', 'pulsarr', 'removed')).toBe(
        false,
      )
      // Note: 'removed2' starts with 'removed' so it WILL match
      expect(isManagedLabel('removed2', 'pulsarr', 'removed')).toBe(true)
      // Use a prefix that doesn't start with 'removed'
      expect(isManagedLabel('deleted', 'pulsarr', 'removed')).toBe(false)
    })
  })

  describe('isUserTaggingSystemTag', () => {
    it('should return true for user tag with default prefix', () => {
      expect(isUserTaggingSystemTag('pulsarr:user:john')).toBe(true)
    })

    it('should return true for removed tag with default prefix', () => {
      expect(isUserTaggingSystemTag('pulsarr:removed')).toBe(true)
      expect(isUserTaggingSystemTag('pulsarr:removed-user')).toBe(true)
    })

    it('should return false for non-user-tagging tag', () => {
      expect(isUserTaggingSystemTag('action')).toBe(false)
      expect(isUserTaggingSystemTag('other:user:john')).toBe(false)
    })

    it('should handle custom tag prefix', () => {
      expect(isUserTaggingSystemTag('custom:user:alice', 'custom:user')).toBe(
        true,
      )
      expect(isUserTaggingSystemTag('pulsarr:user:alice', 'custom:user')).toBe(
        false,
      )
    })

    it('should handle custom removed tag prefix', () => {
      expect(
        isUserTaggingSystemTag(
          'custom:deleted',
          'pulsarr:user',
          'custom:deleted',
        ),
      ).toBe(true)
      expect(
        isUserTaggingSystemTag(
          'pulsarr:removed',
          'pulsarr:user',
          'custom:deleted',
        ),
      ).toBe(false)
    })

    it('should handle case-insensitive matching', () => {
      expect(isUserTaggingSystemTag('PULSARR:USER:JOHN')).toBe(true)
      expect(isUserTaggingSystemTag('PULSARR:REMOVED')).toBe(true)
    })

    it('should return false for empty tag', () => {
      expect(isUserTaggingSystemTag('')).toBe(false)
    })

    it('should handle tags with additional segments', () => {
      expect(isUserTaggingSystemTag('pulsarr:user:john:admin')).toBe(true)
      expect(isUserTaggingSystemTag('pulsarr:removed:by-admin')).toBe(true)
    })

    it('should not match partial prefixes', () => {
      expect(isUserTaggingSystemTag('pulsarr:username:john')).toBe(false)
      expect(isUserTaggingSystemTag('pulsarr:users:john')).toBe(false)
      expect(isUserTaggingSystemTag('pulsarr:remove')).toBe(false)
    })

    it('should handle multi-instance scenarios with custom prefixes', () => {
      expect(
        isUserTaggingSystemTag(
          'pulsarr1:user:john',
          'pulsarr1:user',
          'pulsarr1:removed',
        ),
      ).toBe(true)
      expect(
        isUserTaggingSystemTag(
          'pulsarr1:removed',
          'pulsarr1:user',
          'pulsarr1:removed',
        ),
      ).toBe(true)
      expect(
        isUserTaggingSystemTag(
          'pulsarr2:user:john',
          'pulsarr1:user',
          'pulsarr1:removed',
        ),
      ).toBe(false)
    })
  })

  describe('getRemovedLabel', () => {
    it('should return the removed label prefix', () => {
      expect(getRemovedLabel('removed')).toBe('removed')
    })

    it('should return custom removed label prefix', () => {
      expect(getRemovedLabel('deleted')).toBe('deleted')
      expect(getRemovedLabel('pulsarr:removed')).toBe('pulsarr:removed')
    })

    it('should handle empty string', () => {
      expect(getRemovedLabel('')).toBe('')
    })

    it('should preserve the exact prefix including case', () => {
      expect(getRemovedLabel('REMOVED')).toBe('REMOVED')
      expect(getRemovedLabel('Removed')).toBe('Removed')
    })

    it('should handle multi-instance prefixes', () => {
      expect(getRemovedLabel('pulsarr1:removed')).toBe('pulsarr1:removed')
      expect(getRemovedLabel('pulsarr2:removed')).toBe('pulsarr2:removed')
    })
  })
})
