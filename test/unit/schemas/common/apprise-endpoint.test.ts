import {
  isPlainEmail,
  isValidAppriseEndpoint,
} from '@root/schemas/common/apprise-endpoint.js'
import { describe, expect, it } from 'vitest'

describe('apprise-endpoint', () => {
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

  describe('isValidAppriseEndpoint', () => {
    it('accepts Apprise URLs and plain email addresses', () => {
      expect(isValidAppriseEndpoint('tgram://bottoken/ChatID')).toBe(true)
      expect(isValidAppriseEndpoint('  user@example.com  ')).toBe(true)
    })

    it('rejects empty and unknown values', () => {
      expect(isValidAppriseEndpoint('')).toBe(false)
      expect(isValidAppriseEndpoint('   ')).toBe(false)
      expect(isValidAppriseEndpoint('just-a-string')).toBe(false)
    })

    it('rejects a scheme or an email missing a part', () => {
      for (const value of [
        '://',
        '://target',
        'tgram://',
        '@',
        'user@',
        '@domain',
      ]) {
        expect(isValidAppriseEndpoint(value)).toBe(false)
      }
    })
  })
})
