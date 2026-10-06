import { statusLine } from '@/features/home/lib/status-line'
import { setFormatLocale } from '@/lib/format'

describe('statusLine', () => {
  beforeEach(() => setFormatLocale('en-US'))
  afterEach(() => setFormatLocale(undefined))

  it('says nothing is waiting when no approvals are pending', () => {
    expect(statusLine('running', 0)).toBe(
      'Watchlist sync is running. Nothing is waiting on you.',
    )
  })

  it('counts pending approvals with the matching verb', () => {
    expect(statusLine('running', 1)).toBe(
      'Watchlist sync is running. 1 request needs your approval.',
    )
    expect(statusLine('stopped', 2)).toBe(
      'Watchlist sync is stopped. 2 requests need your approval.',
    )
  })

  it('reads as checking before the sync status arrives', () => {
    expect(statusLine(null, 0)).toBe(
      'Checking watchlist sync. Nothing is waiting on you.',
    )
  })
})
