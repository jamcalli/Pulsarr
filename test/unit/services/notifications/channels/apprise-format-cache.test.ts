import { appriseEndpoint } from '@services/notifications/channels/apprise-format-cache.js'
import { describe, expect, it } from 'vitest'

describe('appriseEndpoint', () => {
  it('joins onto a root base', () => {
    expect(appriseEndpoint('http://apprise:8000', 'notify')).toBe(
      'http://apprise:8000/notify',
    )
  })

  it('keeps the subpath the server is mounted under', () => {
    expect(appriseEndpoint('https://host/apprise', 'notify')).toBe(
      'https://host/apprise/notify',
    )
  })

  it('handles trailing and leading slashes', () => {
    expect(appriseEndpoint('https://host/apprise/', '/notify')).toBe(
      'https://host/apprise/notify',
    )
  })

  it('keeps a trailing slash on the path', () => {
    expect(appriseEndpoint('https://host/apprise', 'details/')).toBe(
      'https://host/apprise/details/',
    )
  })

  it('returns the base root for an empty path', () => {
    expect(appriseEndpoint('http://apprise:8000', '')).toBe(
      'http://apprise:8000/',
    )
    expect(appriseEndpoint('https://host/apprise/', '')).toBe(
      'https://host/apprise/',
    )
  })
})
