import { describe, expect, it } from 'vitest'
import {
  serializeDate,
  serializeRollingShowDates,
} from '../../../src/utils/date-serializer.js'

describe('date-serializer', () => {
  describe('serializeDate', () => {
    it('should serialize Date object to ISO string', () => {
      const date = new Date('2024-01-15T10:30:00.000Z')
      const result = serializeDate(date)
      expect(result).toBe('2024-01-15T10:30:00.000Z')
    })

    it('should return string unchanged when input is already a string', () => {
      const dateString = '2024-01-15T10:30:00.000Z'
      const result = serializeDate(dateString)
      expect(result).toBe(dateString)
    })

    it('should return null when input is null', () => {
      const result = serializeDate(null)
      expect(result).toBe(null)
    })

    it('should return null when input is undefined', () => {
      const result = serializeDate(undefined)
      expect(result).toBe(null)
    })

    it('should handle custom date strings', () => {
      const customString = '2024-12-25'
      const result = serializeDate(customString)
      expect(result).toBe(customString)
    })

    it('should handle Date object with milliseconds', () => {
      const date = new Date('2024-06-15T14:45:30.123Z')
      const result = serializeDate(date)
      expect(result).toBe('2024-06-15T14:45:30.123Z')
    })
  })

  describe('serializeRollingShowDates', () => {
    it('should serialize all date fields to ISO strings', () => {
      const show = {
        id: 1,
        title: 'Test Show',
        last_session_date: new Date('2024-01-15T10:30:00.000Z'),
        created_at: new Date('2024-01-01T00:00:00.000Z'),
        updated_at: new Date('2024-01-10T12:00:00.000Z'),
        last_updated_at: new Date('2024-01-15T08:00:00.000Z'),
      }

      const result = serializeRollingShowDates(show)

      expect(result.last_session_date).toBe('2024-01-15T10:30:00.000Z')
      expect(result.created_at).toBe('2024-01-01T00:00:00.000Z')
      expect(result.updated_at).toBe('2024-01-10T12:00:00.000Z')
      expect(result.last_updated_at).toBe('2024-01-15T08:00:00.000Z')
      expect(result.id).toBe(1)
      expect(result.title).toBe('Test Show')
    })

    it('should handle null last_session_date', () => {
      const show = {
        last_session_date: null,
        created_at: new Date('2024-01-01T00:00:00.000Z'),
        updated_at: new Date('2024-01-10T12:00:00.000Z'),
        last_updated_at: new Date('2024-01-15T08:00:00.000Z'),
      }

      const result = serializeRollingShowDates(show)

      expect(result.last_session_date).toBe(null)
    })

    it('should use empty string when created_at is missing', () => {
      const show = {
        last_session_date: new Date('2024-01-15T10:30:00.000Z'),
        updated_at: new Date('2024-01-10T12:00:00.000Z'),
      }

      const result = serializeRollingShowDates(show)

      expect(result.created_at).toBe('')
    })

    it('should use empty string when updated_at is missing', () => {
      const show = {
        last_session_date: new Date('2024-01-15T10:30:00.000Z'),
        created_at: new Date('2024-01-01T00:00:00.000Z'),
      }

      const result = serializeRollingShowDates(show)

      expect(result.updated_at).toBe('')
    })

    it('should fallback last_updated_at to updated_at when missing', () => {
      const show = {
        last_session_date: new Date('2024-01-15T10:30:00.000Z'),
        created_at: new Date('2024-01-01T00:00:00.000Z'),
        updated_at: new Date('2024-01-10T12:00:00.000Z'),
      }

      const result = serializeRollingShowDates(show)

      expect(result.last_updated_at).toBe('2024-01-10T12:00:00.000Z')
    })

    it('should use empty string when both last_updated_at and updated_at are missing', () => {
      const show = {
        last_session_date: new Date('2024-01-15T10:30:00.000Z'),
        created_at: new Date('2024-01-01T00:00:00.000Z'),
      }

      const result = serializeRollingShowDates(show)

      expect(result.last_updated_at).toBe('')
    })

    it('should handle string date inputs', () => {
      const show = {
        last_session_date: '2024-01-15T10:30:00.000Z',
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-10T12:00:00.000Z',
        last_updated_at: '2024-01-15T08:00:00.000Z',
      }

      const result = serializeRollingShowDates(show)

      expect(result.last_session_date).toBe('2024-01-15T10:30:00.000Z')
      expect(result.created_at).toBe('2024-01-01T00:00:00.000Z')
      expect(result.updated_at).toBe('2024-01-10T12:00:00.000Z')
      expect(result.last_updated_at).toBe('2024-01-15T08:00:00.000Z')
    })

    it('should handle mixed Date and string inputs', () => {
      const show = {
        last_session_date: new Date('2024-01-15T10:30:00.000Z'),
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: new Date('2024-01-10T12:00:00.000Z'),
        last_updated_at: '2024-01-15T08:00:00.000Z',
      }

      const result = serializeRollingShowDates(show)

      expect(result.last_session_date).toBe('2024-01-15T10:30:00.000Z')
      expect(result.created_at).toBe('2024-01-01T00:00:00.000Z')
      expect(result.updated_at).toBe('2024-01-10T12:00:00.000Z')
      expect(result.last_updated_at).toBe('2024-01-15T08:00:00.000Z')
    })

    it('should preserve all non-date properties', () => {
      const show = {
        id: 123,
        title: 'My Show',
        status: 'active',
        rating: 8.5,
        last_session_date: new Date('2024-01-15T10:30:00.000Z'),
        created_at: new Date('2024-01-01T00:00:00.000Z'),
        updated_at: new Date('2024-01-10T12:00:00.000Z'),
        last_updated_at: new Date('2024-01-15T08:00:00.000Z'),
      }

      const result = serializeRollingShowDates(show)

      expect(result.id).toBe(123)
      expect(result.title).toBe('My Show')
      expect(result.status).toBe('active')
      expect(result.rating).toBe(8.5)
    })

    it('should handle empty object with only date fields', () => {
      const show = {}

      const result = serializeRollingShowDates(show)

      expect(result.last_session_date).toBe(null)
      expect(result.created_at).toBe('')
      expect(result.updated_at).toBe('')
      expect(result.last_updated_at).toBe('')
    })

    it('should handle null values for all date fields', () => {
      const show = {
        last_session_date: null as Date | null,
        created_at: null as Date | null,
        updated_at: null as Date | null,
        last_updated_at: null as Date | null,
      }

      const result = serializeRollingShowDates(show)

      expect(result.last_session_date).toBe(null)
      expect(result.created_at).toBe('')
      expect(result.updated_at).toBe('')
      expect(result.last_updated_at).toBe('')
    })
  })
})
