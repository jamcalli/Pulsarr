import {
  isPlainEmail,
  resolveAppriseUrl,
  resolveAppriseUrls,
} from '@utils/notifications/apprise-email.js'
import { describe, expect, it } from 'vitest'

describe('apprise-email', () => {
  describe('isPlainEmail', () => {
    it('should return true for plain email addresses', () => {
      expect(isPlainEmail('user@example.com')).toBe(true)
      expect(isPlainEmail('john.doe@gmail.com')).toBe(true)
      expect(isPlainEmail('test+tag@domain.org')).toBe(true)
    })

    it('should return false for Apprise URLs', () => {
      expect(isPlainEmail('mailtos://user:pass@gmail.com')).toBe(false)
      expect(isPlainEmail('mailto://user:pass@smtp.example.com')).toBe(false)
      expect(isPlainEmail('discord://webhook/token')).toBe(false)
      expect(isPlainEmail('telegram://bottoken/ChatID')).toBe(false)
    })

    it('should return false for strings without @', () => {
      expect(isPlainEmail('discord://webhook/token')).toBe(false)
      expect(isPlainEmail('https://example.com')).toBe(false)
      expect(isPlainEmail('just-a-string')).toBe(false)
    })
  })

  describe('resolveAppriseUrl', () => {
    const adminSender = 'mailtos://admin:password@gmail.com'

    describe('with full Apprise URLs', () => {
      it('should return full URLs unchanged', () => {
        expect(resolveAppriseUrl('discord://webhook/token', adminSender)).toBe(
          'discord://webhook/token',
        )
        expect(
          resolveAppriseUrl('mailtos://user:pass@gmail.com', adminSender),
        ).toBe('mailtos://user:pass@gmail.com')
        expect(
          resolveAppriseUrl('telegram://bottoken/ChatID', adminSender),
        ).toBe('telegram://bottoken/ChatID')
      })

      it('should return full URLs even without admin sender', () => {
        expect(resolveAppriseUrl('discord://webhook/token', undefined)).toBe(
          'discord://webhook/token',
        )
      })
    })

    describe('with plain email addresses', () => {
      it('should resolve plain email using admin sender', () => {
        const result = resolveAppriseUrl('user@example.com', adminSender)
        expect(result).toBe(
          'mailtos://admin:password@gmail.com?to=user%40example.com',
        )
      })

      it('should URL-encode the email address', () => {
        const result = resolveAppriseUrl('test+tag@example.com', adminSender)
        expect(result).toBe(
          'mailtos://admin:password@gmail.com?to=test%2Btag%40example.com',
        )
      })

      it('should return null for plain email without admin sender', () => {
        expect(resolveAppriseUrl('user@example.com', undefined)).toBeNull()
        expect(resolveAppriseUrl('user@example.com', '')).toBeNull()
      })

      it('should handle admin sender URL with existing query params', () => {
        const senderWithParams = 'mailtos://admin:pass@gmail.com?timeout=30'
        const result = resolveAppriseUrl('user@example.com', senderWithParams)
        expect(result).toBe(
          'mailtos://admin:pass@gmail.com?timeout=30&to=user%40example.com',
        )
      })
    })

    describe('edge cases', () => {
      it('should return null for empty string', () => {
        expect(resolveAppriseUrl('', adminSender)).toBeNull()
      })

      it('should return null for unknown format', () => {
        expect(resolveAppriseUrl('not-an-email-or-url', adminSender)).toBeNull()
      })
    })
  })

  describe('resolveAppriseUrls', () => {
    const adminSender = 'mailtos://admin:password@gmail.com'

    it('should resolve comma-separated mixed URLs and emails', () => {
      const input = 'discord://webhook,user@example.com,telegram://bot'
      const result = resolveAppriseUrls(input, adminSender)

      expect(result).toBe(
        'discord://webhook,mailtos://admin:password@gmail.com?to=user%40example.com,telegram://bot',
      )
    })

    it('should filter out unresolvable entries', () => {
      const input = 'discord://webhook,invalid-entry,user@example.com'
      const result = resolveAppriseUrls(input, adminSender)

      expect(result).toBe(
        'discord://webhook,mailtos://admin:password@gmail.com?to=user%40example.com',
      )
    })

    it('should filter out plain emails when no admin sender', () => {
      const input = 'discord://webhook,user@example.com,telegram://bot'
      const result = resolveAppriseUrls(input, undefined)

      expect(result).toBe('discord://webhook,telegram://bot')
    })

    it('should return null when all entries are unresolvable', () => {
      const input = 'user@example.com,another@test.com'
      const result = resolveAppriseUrls(input, undefined)

      expect(result).toBeNull()
    })

    it('should return null for empty string', () => {
      expect(resolveAppriseUrls('', adminSender)).toBeNull()
    })

    it('should handle whitespace in comma-separated list', () => {
      const input = '  discord://webhook  ,  user@example.com  '
      const result = resolveAppriseUrls(input, adminSender)

      expect(result).toBe(
        'discord://webhook,mailtos://admin:password@gmail.com?to=user%40example.com',
      )
    })

    it('should handle single URL', () => {
      expect(resolveAppriseUrls('discord://webhook', adminSender)).toBe(
        'discord://webhook',
      )
    })

    it('should handle single email', () => {
      expect(resolveAppriseUrls('user@example.com', adminSender)).toBe(
        'mailtos://admin:password@gmail.com?to=user%40example.com',
      )
    })

    it('should filter empty entries from comma-separated list', () => {
      const input = 'discord://webhook,,user@example.com,'
      const result = resolveAppriseUrls(input, adminSender)

      expect(result).toBe(
        'discord://webhook,mailtos://admin:password@gmail.com?to=user%40example.com',
      )
    })
  })
})
