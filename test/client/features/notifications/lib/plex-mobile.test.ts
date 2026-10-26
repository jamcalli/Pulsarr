import {
  plexMobileLockReason,
  pushTestUnavailableReason,
} from '@/features/notifications/lib/plex-mobile'

describe('plex-mobile', () => {
  it('locks only without Plex Pass or a server', () => {
    expect(plexMobileLockReason('enabled')).toBeNull()
    expect(plexMobileLockReason('disabled')).toBeNull()
    expect(plexMobileLockReason('no_plex_pass')).toBe(
      'Needs Plex Pass on the connected Plex server.',
    )
    expect(plexMobileLockReason('not_configured')).toBe(
      'Connect a Plex server first.',
    )
  })

  it('blocks the test push until the saved setting is on and clean', () => {
    const off = 'Save with Plex mobile turned on to send a test.'
    expect(pushTestUnavailableReason('enabled', true, false)).toBeNull()
    expect(pushTestUnavailableReason(null, true, false)).toBeNull()
    expect(pushTestUnavailableReason(null, false, false)).toBe(off)
    expect(pushTestUnavailableReason('disabled', true, false)).toBe(off)
    expect(pushTestUnavailableReason('enabled', true, true)).toBe(
      'Save or discard your changes first.',
    )
  })
})
