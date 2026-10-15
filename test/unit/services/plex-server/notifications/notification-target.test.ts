import { resolveNotificationTarget } from '@services/plex-server/notifications/notification-target.js'
import { describe, expect, it } from 'vitest'

describe('resolveNotificationTarget', () => {
  it('returns null without a token', () => {
    expect(
      resolveNotificationTarget({}, 'http://plex.lan:32400', undefined),
    ).toBeNull()
  })

  it('derives host, port and SSL from the server address', () => {
    expect(
      resolveNotificationTarget({}, 'https://plex.example.com', 'linked'),
    ).toEqual({
      plexToken: 'linked',
      plexHost: 'plex.example.com',
      plexPort: 443,
      useSsl: true,
    })
  })

  it('applies a port or SSL sent without a host on top of the derived address', () => {
    expect(
      resolveNotificationTarget(
        { plexPort: 32401 },
        'http://plex.lan:32400',
        'linked',
      ),
    ).toMatchObject({ plexHost: 'plex.lan', plexPort: 32401, useSsl: false })
    expect(
      resolveNotificationTarget({ useSsl: true }, 'http://plex.lan', 'linked'),
    ).toMatchObject({ plexHost: 'plex.lan', plexPort: 443, useSsl: true })
  })

  it('uses the sent host and token as given', () => {
    expect(
      resolveNotificationTarget(
        { plexHost: '10.0.0.5', plexToken: 'sent' },
        'http://plex.lan:32400',
        'linked',
      ),
    ).toEqual({
      plexToken: 'sent',
      plexHost: '10.0.0.5',
      plexPort: 32400,
      useSsl: false,
    })
  })

  it('reads a saved http address without a port the way Pulsarr reaches it', () => {
    for (const url of [
      'http://plex.example.com',
      'http://plex.example.com:80',
    ]) {
      expect(resolveNotificationTarget({}, url, 'linked')).toMatchObject({
        plexHost: 'plex.example.com',
        plexPort: 80,
        useSsl: false,
      })
    }
  })
})
