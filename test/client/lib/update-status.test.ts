import { availableUpdate, updatePollInterval } from '@/lib/update-status'

const base = {
  currentVersion: '0.19.4',
  latestVersion: '0.20.0',
  updateAvailable: true,
  releaseUrl: 'https://github.com/jamcalli/Pulsarr/releases/tag/v0.20.0',
  releaseName: 'v0.20.0',
  releaseBody: 'notes',
  releaseBodyHtml: '<p>notes</p>',
  publishedAt: '2026-09-28T00:00:00Z',
  lastCheckedAt: '2026-10-01T00:00:00Z',
  lastError: null,
  status: 'ok' as const,
}

describe('availableUpdate', () => {
  it('returns the release when an update is available', () => {
    expect(availableUpdate(base)).toEqual({
      latestVersion: '0.20.0',
      releaseUrl: base.releaseUrl,
      releaseBodyHtml: '<p>notes</p>',
      publishedAt: base.publishedAt,
    })
  })

  it.each([
    ['no data', undefined],
    ['no update', { ...base, updateAvailable: false }],
    ['no latest version', { ...base, latestVersion: null }],
    ['no release link', { ...base, releaseUrl: null }],
  ])('returns null with %s', (_, status) => {
    expect(availableUpdate(status)).toBeNull()
  })
})

describe('updatePollInterval', () => {
  it('polls every 5 seconds while the server check is pending', () => {
    expect(updatePollInterval({ ...base, status: 'pending' })).toBe(5000)
  })

  it.each([
    ['ok', { ...base, status: 'ok' as const }],
    ['error', { ...base, status: 'error' as const }],
    ['no data', undefined],
  ])('polls every 15 minutes when %s', (_, status) => {
    expect(updatePollInterval(status)).toBe(15 * 60 * 1000)
  })
})
