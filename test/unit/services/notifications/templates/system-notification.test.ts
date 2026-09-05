import { isSafetyNotification } from '@services/notifications/templates/system-notification.js'
import { describe, expect, it } from 'vitest'

describe('isSafetyNotification', () => {
  it('should match a Safety Reason field', () => {
    expect(
      isSafetyNotification({
        title: 'Delete Sync',
        embedFields: [{ name: 'Safety Reason', value: 'Too many deletions' }],
      }),
    ).toBe(true)
  })

  it('should match a title mentioning a safety trigger', () => {
    expect(
      isSafetyNotification({
        title: '⚠️ Delete Sync Safety Triggered',
        embedFields: [],
      }),
    ).toBe(true)
  })

  it('should match the safetyTriggered flag', () => {
    expect(
      isSafetyNotification({
        title: 'Delete Sync',
        embedFields: [],
        safetyTriggered: true,
      }),
    ).toBe(true)
  })

  it('should not match an ordinary notification', () => {
    expect(
      isSafetyNotification({
        title: 'Delete Sync',
        embedFields: [{ name: 'Summary', value: 'All good' }],
        safetyTriggered: false,
      }),
    ).toBe(false)
  })
})
