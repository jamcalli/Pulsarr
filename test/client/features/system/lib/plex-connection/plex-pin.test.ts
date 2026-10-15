import {
  pinPhase,
  plexLinkHref,
  spokenCode,
} from '@/features/system/lib/plex-connection/plex-pin'

describe('plex pin', () => {
  it('links to plex.tv with the code filled in', () => {
    expect(plexLinkHref('K7QM')).toBe('https://plex.tv/link?pin=K7QM')
  })

  it('spaces the code out for screen readers', () => {
    expect(spokenCode('K7QM')).toBe('Code K 7 Q M')
  })

  it.each([
    [{ failed: true, hasPin: true, authToken: 'x', expiresIn: 10 }, 'failed'],
    [
      { failed: false, hasPin: false, authToken: null, expiresIn: null },
      'creating',
    ],
    [
      { failed: false, hasPin: true, authToken: 'x', expiresIn: 10 },
      'approved',
    ],
    [{ failed: false, hasPin: true, authToken: null, expiresIn: 0 }, 'expired'],
    [
      { failed: false, hasPin: true, authToken: null, expiresIn: 600 },
      'waiting',
    ],
    [
      { failed: false, hasPin: true, authToken: null, expiresIn: null },
      'waiting',
    ],
  ] as const)('reads %o as %s', (input, phase) => {
    expect(pinPhase(input)).toBe(phase)
  })
})
