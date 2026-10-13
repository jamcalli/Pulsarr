import {
  allowedStatusesUpTo,
  isStatusUpgrade,
} from '@utils/watchlist-status-rank.js'
import { describe, expect, it } from 'vitest'

describe('isStatusUpgrade', () => {
  it('is true when the target ranks higher', () => {
    expect(isStatusUpgrade('pending', 'requested')).toBe(true)
    expect(isStatusUpgrade('requested', 'grabbed')).toBe(true)
    expect(isStatusUpgrade('grabbed', 'notified')).toBe(true)
  })

  it('is false for the same status', () => {
    expect(isStatusUpgrade('grabbed', 'grabbed')).toBe(false)
  })

  it('is false for a downgrade', () => {
    expect(isStatusUpgrade('notified', 'grabbed')).toBe(false)
    expect(isStatusUpgrade('grabbed', 'requested')).toBe(false)
  })
})

describe('allowedStatusesUpTo', () => {
  it('returns every status ranked at or below the target', () => {
    expect(allowedStatusesUpTo('grabbed')).toEqual([
      'pending',
      'requested',
      'grabbed',
    ])
  })

  it('returns only pending for pending', () => {
    expect(allowedStatusesUpTo('pending')).toEqual(['pending'])
  })
})
