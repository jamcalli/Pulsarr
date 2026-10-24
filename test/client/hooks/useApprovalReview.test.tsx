import { QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import type { ReactNode } from 'react'
import { useApprovalReview } from '@/hooks/useApprovalReview'
import { withRouting } from '@/lib/approval'
import { approvalRequestKeys } from '@/lib/query-keys'
import { queryClient } from '@/lib/queryClient'
import type { components } from '@/types/api.js'
import { server } from '../setup.js'

type ApprovalRequest = components['schemas']['ApprovalRequest']
type ApprovalRouting = components['schemas']['ApprovalRouting']

const routing: ApprovalRouting = {
  instanceId: 1,
  instanceType: 'sonarr',
  priority: 50,
}

function makeRequest(
  overrides: Partial<ApprovalRequest> = {},
): ApprovalRequest {
  return {
    id: 7,
    userId: 2,
    userName: 'sarah',
    contentType: 'show',
    contentTitle: 'Severance',
    contentKey: 'key',
    contentGuids: [],
    thumb: null,
    proposedRouterDecision: {
      action: 'require_approval',
      approval: {
        reason: 'stored',
        triggeredBy: 'manual_flag',
        data: {},
        proposedRouting: routing,
      },
    },
    routerRuleId: null,
    triggeredBy: 'manual_flag',
    approvalReason: null,
    status: 'pending',
    approvedBy: null,
    approvalNotes: null,
    expiresAt: null,
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-02T12:30:00.000Z',
    ...overrides,
  }
}

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

function captureBody(method: 'post' | 'patch', path: string) {
  const bodies: unknown[] = []
  server.use(
    http[method](path, async ({ request }) => {
      bodies.push(await request.json())
      return HttpResponse.json({
        success: true,
        message: 'ok',
        approvalRequest: makeRequest({ approvalNotes: 'saved' }),
      })
    }),
  )
  return bodies
}

afterEach(() => {
  queryClient.clear()
})

describe('useApprovalReview', () => {
  it('moves between review, edit and deny stages', () => {
    const { result } = renderHook(() => useApprovalReview(makeRequest()), {
      wrapper,
    })

    expect(result.current.stage).toBe('review')
    act(() => result.current.startEdit())
    expect(result.current.stage).toBe('edit')
    act(() => result.current.cancelEdit())
    expect(result.current.stage).toBe('review')
    act(() => result.current.startDeny())
    act(() => result.current.setReason('nope'))
    expect(result.current.stage).toBe('deny')
    act(() => result.current.cancelDeny())
    expect(result.current.stage).toBe('review')
    expect(result.current.reason).toBe('')
  })

  it('blocks approve while editing and when no routing is proposed', () => {
    const { result } = renderHook(() => useApprovalReview(makeRequest()), {
      wrapper,
    })
    expect(result.current.canApprove).toBe(true)
    act(() => result.current.startEdit())
    expect(result.current.canApprove).toBe(false)
    expect(result.current.approveBlockedReason).toBe(
      'Save or cancel your routing changes to approve.',
    )

    const unrouted = renderHook(
      () =>
        useApprovalReview(
          makeRequest({ proposedRouterDecision: { action: 'continue' } }),
        ),
      { wrapper },
    )
    expect(unrouted.result.current.canApprove).toBe(false)
    expect(unrouted.result.current.approveBlockedReason).toBe(
      'Set routing to approve.',
    )
  })

  it('sends trimmed notes on approve and calls onDecided', async () => {
    const bodies = captureBody('post', '/v1/approval/requests/7/approve')
    const onDecided = vi.fn()
    const { result } = renderHook(
      () => useApprovalReview(makeRequest(), { onDecided }),
      { wrapper },
    )

    act(() => result.current.setNotes('  looks good  '))
    act(() => result.current.approve())

    await waitFor(() => expect(onDecided).toHaveBeenCalledTimes(1))
    expect(bodies).toEqual([{ notes: 'looks good' }])
  })

  it('omits blank notes and reasons', async () => {
    const approveBodies = captureBody('post', '/v1/approval/requests/7/approve')
    const rejectBodies = captureBody('post', '/v1/approval/requests/7/reject')
    const { result } = renderHook(() => useApprovalReview(makeRequest()), {
      wrapper,
    })

    act(() => result.current.setNotes('   '))
    act(() => result.current.approve())
    await waitFor(() => expect(approveBodies).toHaveLength(1))
    await waitFor(() => expect(result.current.busy).toBeNull())

    act(() => result.current.startDeny())
    act(() => result.current.setReason('  '))
    act(() => result.current.deny())
    await waitFor(() => expect(rejectBodies).toHaveLength(1))

    expect(approveBodies).toEqual([{}])
    expect(rejectBodies).toEqual([{}])
  })

  it('sends a trimmed reason on deny', async () => {
    const bodies = captureBody('post', '/v1/approval/requests/7/reject')
    const { result } = renderHook(() => useApprovalReview(makeRequest()), {
      wrapper,
    })

    act(() => result.current.startDeny())
    act(() => result.current.setReason(' duplicate '))
    act(() => result.current.deny())

    await waitFor(() => expect(bodies).toEqual([{ reason: 'duplicate' }]))
  })

  it('saves routing through withRouting, caches the response and returns to review', async () => {
    const bodies = captureBody('patch', '/v1/approval/requests/7')
    const approval = makeRequest()
    const next: ApprovalRouting = { ...routing, instanceId: 3 }
    const { result } = renderHook(() => useApprovalReview(approval), {
      wrapper,
    })

    act(() => result.current.startEdit())
    act(() => result.current.saveRouting(next))

    await waitFor(() => expect(result.current.stage).toBe('review'))
    expect(bodies).toEqual([
      { proposedRouterDecision: withRouting(approval, next) },
    ])
    expect(queryClient.getQueryData(approvalRequestKeys.byId(7))).toMatchObject(
      { approvalRequest: { approvalNotes: 'saved' } },
    )
  })

  it('surfaces the server message when approve conflicts', async () => {
    server.use(
      http.post('/v1/approval/requests/7/approve', () =>
        HttpResponse.json(
          { statusCode: 409, error: 'Conflict', message: 'Already approved' },
          { status: 409 },
        ),
      ),
    )
    const { result } = renderHook(() => useApprovalReview(makeRequest()), {
      wrapper,
    })

    act(() => result.current.approve())

    await waitFor(() =>
      expect(result.current.errorMessage).toBe('Already approved'),
    )
    act(() => result.current.startDeny())
    expect(result.current.errorMessage).toBeNull()
  })
})
