import {
  bulkConfirmCopy,
  bulkFailure,
} from '@/features/requests/lib/approval-queue/bulk-actions'
import { setFormatLocale } from '@/lib/format'

describe('bulkFailure', () => {
  beforeEach(() => setFormatLocale('en-US'))
  afterEach(() => setFormatLocale(undefined))

  it('is null when every request went through', () => {
    expect(
      bulkFailure('approve', {
        successful: 3,
        failed: [],
        errors: [],
        total: 3,
      }),
    ).toBeNull()
  })

  it('names how many failed with the first error', () => {
    expect(
      bulkFailure('approve', {
        successful: 3,
        failed: [2, 5],
        errors: ['Shogun: Sonarr 4K did not respond in time.', 'Other'],
        total: 5,
      }),
    ).toEqual({
      message: '2 of 5 requests were not approved.',
      detail: 'Shogun: Sonarr 4K did not respond in time.',
    })
  })

  it.each([
    ['deny', '1 of 4 requests was not denied.'],
    ['delete', '1 of 4 requests was not deleted.'],
  ] as const)('words a %s failure', (action, message) => {
    expect(
      bulkFailure(action, { successful: 3, failed: [9], errors: [], total: 4 }),
    ).toEqual({ message, detail: null })
  })
})

describe('bulkConfirmCopy', () => {
  beforeEach(() => setFormatLocale('en-US'))
  afterEach(() => setFormatLocale(undefined))

  it('explains that deleting refuses nothing', () => {
    expect(bulkConfirmCopy('delete', 3, false)).toMatchObject({
      title: 'Delete 3 requests?',
      description:
        "Deleting doesn't refuse anything. Waiting and denied titles can come back as new requests, and anything already sent to Radarr or Sonarr stays where it is.",
      confirmLabel: 'Delete 3 requests',
      variant: 'destructive',
      noteLabel: null,
    })
  })

  it('makes deny destructive with a reason and approve default with notes', () => {
    expect(bulkConfirmCopy('deny', 1, false)).toMatchObject({
      title: 'Deny 1 request?',
      confirmLabel: 'Deny 1 request',
      variant: 'destructive',
      noteLabel: 'Reason',
    })
    expect(bulkConfirmCopy('approve', 2, false)).toMatchObject({
      title: 'Approve 2 requests?',
      confirmLabel: 'Approve 2 requests',
      variant: 'default',
      noteLabel: 'Notes',
    })
  })
})
