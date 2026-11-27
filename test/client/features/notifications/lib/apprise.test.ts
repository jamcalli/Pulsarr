import {
  appriseLockReason,
  appriseStatusFromConfig,
} from '@/features/notifications/lib/apprise'

describe('apprise', () => {
  it('derives the startup status from the config', () => {
    expect(
      appriseStatusFromConfig({ appriseUrl: '', enableApprise: false }),
    ).toBe('not_configured')
    expect(
      appriseStatusFromConfig({
        appriseUrl: 'http://a:8000',
        enableApprise: false,
      }),
    ).toBe('unreachable')
    expect(
      appriseStatusFromConfig({
        appriseUrl: 'http://a:8000',
        enableApprise: true,
      }),
    ).toBe('enabled')
  })

  it('locks the settings unless Apprise is enabled', () => {
    expect(appriseLockReason('enabled')).toBeNull()
    expect(appriseLockReason('unreachable')).toBe(
      'Apprise is unreachable, so these settings do nothing until the server answers.',
    )
    expect(appriseLockReason('not_configured')).toBe(
      'Set up an Apprise server to use these settings.',
    )
  })

  it('names the lists when a page locks lists', () => {
    expect(appriseLockReason('enabled', 'lists')).toBeNull()
    expect(appriseLockReason('unreachable', 'lists')).toBe(
      'Apprise is unreachable, so these lists do nothing until the server answers.',
    )
    expect(appriseLockReason('not_configured', 'lists')).toBe(
      'Set up an Apprise server to use these lists.',
    )
  })
})
