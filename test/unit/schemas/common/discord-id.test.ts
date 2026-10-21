import {
  DiscordIdSchema,
  isDiscordSnowflake,
} from '@root/schemas/common/discord-id.schema.js'
import { describe, expect, it } from 'vitest'

describe('discord-id', () => {
  describe('isDiscordSnowflake', () => {
    it('should accept 17 to 20 digit ids, trimmed', () => {
      expect(isDiscordSnowflake('12345678901234567')).toBe(true)
      expect(isDiscordSnowflake(' 284519736420163584 ')).toBe(true)
      expect(isDiscordSnowflake('12345678901234567890')).toBe(true)
    })

    it('should reject usernames, short ids and mention syntax', () => {
      expect(isDiscordSnowflake('alice#1234')).toBe(false)
      expect(isDiscordSnowflake('123456789')).toBe(false)
      expect(isDiscordSnowflake('<@284519736420163584>')).toBe(false)
      expect(isDiscordSnowflake('')).toBe(false)
    })
  })

  describe('DiscordIdSchema', () => {
    it('should trim and keep a valid id', () => {
      expect(DiscordIdSchema.parse(' 284519736420163584 ')).toBe(
        '284519736420163584',
      )
    })

    it('should reject an invalid id with the field message', () => {
      const result = DiscordIdSchema.safeParse('alice#1234')
      expect(result.success).toBe(false)
      expect(result.error?.issues[0]?.message).toBe('Must be a Discord user ID')
    })
  })
})
