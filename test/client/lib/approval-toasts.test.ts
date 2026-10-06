import type { ApprovalMetadata } from '@root/types/progress.types.js'
import {
  approvalToast,
  isApprovalMetadata,
  isToastedApprovalAction,
} from '@/lib/approval-toasts'

const request: ApprovalMetadata = {
  action: 'created',
  requestId: 1,
  userId: 2,
  userName: 'sam',
  contentTitle: 'Alien',
  contentType: 'movie',
  status: 'pending',
}

describe('approvalToast', () => {
  it.each([
    ['created', 'New approval request', 'sam requested Alien (Movie)'],
    ['approved', 'Request approved', 'Alien has been approved for sam'],
    ['rejected', 'Request denied', "sam's request for Alien was denied"],
    ['deleted', 'Request deleted', 'Request for Alien by sam was deleted'],
  ] as const)('names one %s request', (action, title, description) => {
    expect(approvalToast(action, [request])).toEqual({ title, description })
  })

  it('collapses a burst into a count', () => {
    expect(approvalToast('approved', [request, request, request])).toEqual({
      title: 'Requests approved',
      description: '3 approval requests have been approved',
    })
  })
})

describe('isToastedApprovalAction', () => {
  it('skips updates', () => {
    expect(isToastedApprovalAction('updated')).toBe(false)
    expect(isToastedApprovalAction('created')).toBe(true)
  })
})

describe('isApprovalMetadata', () => {
  it('accepts approval metadata only', () => {
    expect(isApprovalMetadata(request)).toBe(true)
    expect(isApprovalMetadata({ status: 'running' })).toBe(false)
    expect(isApprovalMetadata({})).toBe(false)
    expect(isApprovalMetadata(undefined)).toBe(false)
  })
})
