import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import ApprovalQueuePage from '@/features/requests/pages/approval-queue'
import { setFormatLocale } from '@/lib/format'
import { queryClient } from '@/lib/queryClient'
import { useProgressStore } from '@/stores/progressStore'
import type { components } from '@/types/api.js'
import {
  makeApproval,
  mockApprovalEndpoints,
  mockQuotaConfig,
} from '../../../approval-fixtures.js'
import { server } from '../../../setup.js'
import { stubViewport } from '../../../viewport.js'

type ApprovalRequest = components['schemas']['ApprovalRequest']
type BulkResult = components['schemas']['ApprovalBulkResult']
type ApprovePayload = components['schemas']['ApprovalBulkApprovePayload']
type RejectPayload = components['schemas']['ApprovalBulkRejectPayload']
type DeletePayload = components['schemas']['ApprovalBulkDeletePayload']

const stats = {
  pending: 3,
  approved: 412,
  rejected: 37,
  expired: 19,
  auto_approved: 128,
  totalRequests: 599,
}

const pending: ApprovalRequest[] = [
  makeApproval({ id: 1, contentTitle: 'Severance', userName: 'sarah' }),
  makeApproval({
    id: 2,
    contentTitle: 'Dune: Part Two',
    contentType: 'movie',
    userName: 'jamie',
    triggeredBy: 'manual_flag',
    approvalReason: 'Flagged',
    proposedRouterDecision: {
      action: 'require_approval',
      approval: {
        reason: 'Flagged',
        triggeredBy: 'manual_flag',
        data: { criteriaType: 'user_requires_approval' },
      },
    },
  }),
  makeApproval({ id: 3, contentTitle: 'Andor', userName: 'sarah' }),
]

const history: ApprovalRequest[] = [
  makeApproval({ id: 11, contentTitle: 'Fargo', status: 'rejected' }),
  makeApproval({ id: 12, contentTitle: 'Aftersun', status: 'rejected' }),
  makeApproval({ id: 13, contentTitle: 'Arcane', status: 'approved' }),
]

function user(id: number, name: string, alias: string | null) {
  return {
    id,
    name,
    apprise: null,
    alias,
    discord_id: null,
    notify_apprise: false,
    notify_discord: false,
    notify_discord_mention: false,
    notify_plex_mobile: false,
    can_sync: true,
    requires_approval: false,
    is_primary_token: false,
    avatar: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  }
}

function mockQueue({
  rows = pending,
  total = rows.length,
  result,
  approveStatus = 200,
}: {
  rows?: ApprovalRequest[]
  total?: number
  result?: (ids: number[]) => BulkResult
  approveStatus?: number
} = {}) {
  mockApprovalEndpoints(pending[0])
  let current = rows
  const queries: URLSearchParams[] = []
  const bodies = {
    approve: [] as unknown[],
    reject: [] as unknown[],
    delete: [] as unknown[],
  }
  const respond = (ids: number[]) => {
    const outcome = result?.(ids) ?? {
      successful: ids.length,
      failed: [],
      errors: [],
      total: ids.length,
    }
    current = current.filter(
      (row) => !ids.includes(row.id) || outcome.failed.includes(row.id),
    )
    return HttpResponse.json({ success: true, message: 'ok', result: outcome })
  }
  server.use(
    http.get('/v1/approval/requests', ({ request }) => {
      queries.push(new URL(request.url).searchParams)
      return HttpResponse.json({
        success: true,
        message: 'ok',
        approvalRequests: current,
        total: total - rows.length + current.length,
        limit: 20,
        offset: 0,
      })
    }),
    http.get('/v1/approval/stats', () =>
      HttpResponse.json({ success: true, message: 'ok', stats }),
    ),
    http.get('/v1/users/list', () =>
      HttpResponse.json({
        success: true,
        message: 'ok',
        users: [user(1, 'sarah', 'Mom'), user(2, 'jamie', null)],
      }),
    ),
    http.post<never, ApprovePayload>(
      '/v1/approval/requests/bulk/approve',
      async ({ request }) => {
        const body = await request.json()
        bodies.approve.push(body)
        if (approveStatus !== 200) {
          return HttpResponse.json(
            {
              statusCode: approveStatus,
              error: 'Service Unavailable',
              message:
                'Cannot process bulk approval: sonarr instances are unavailable',
            },
            { status: approveStatus },
          )
        }
        return respond(body.requestIds)
      },
    ),
    http.post<never, RejectPayload>(
      '/v1/approval/requests/bulk/reject',
      async ({ request }) => {
        const body = await request.json()
        bodies.reject.push(body)
        return respond(body.requestIds)
      },
    ),
    http.delete<never, DeletePayload>(
      '/v1/approval/requests/bulk/delete',
      async ({ request }) => {
        const body = await request.json()
        bodies.delete.push(body)
        return respond(body.requestIds)
      },
    ),
  )
  return { queries, bodies }
}

function renderPage(initialEntry = '/') {
  const router = createMemoryRouter(
    [{ path: '*', element: <ApprovalQueuePage /> }],
    { initialEntries: [initialEntry] },
  )
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return router
}

function selectionBar() {
  return screen.getByRole('region', { name: 'Selection' })
}

describe('ApprovalQueuePage', () => {
  beforeEach(() => {
    setFormatLocale('en-US')
    stubViewport({ mobile: false })
    mockQuotaConfig()
    // keeps subscribers from opening the progress EventSource
    useProgressStore.setState({ isConnecting: true, systemStatusCache: {} })
  })

  afterEach(() => {
    queryClient.clear()
    setFormatLocale(undefined)
    vi.unstubAllGlobals()
  })

  it('lists pending requests oldest first and opens the review', async () => {
    const user = userEvent.setup()
    const { queries } = mockQueue()
    renderPage()

    const table = await screen.findByRole('table', { name: 'Pending requests' })
    expect(within(table).getByText('Dune: Part Two')).toBeInTheDocument()
    expect(await within(table).findAllByText('Mom')).toHaveLength(2)
    expect(
      within(table).getByText('Every request from jamie needs approval'),
    ).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Pending/ })).toHaveTextContent('3')
    expect(
      screen.getByRole('columnheader', { name: 'Requested' }),
    ).toHaveAttribute('aria-sort', 'ascending')
    expect(Object.fromEntries(queries[0])).toEqual({
      status: 'pending',
      sortBy: 'createdAt',
      sortOrder: 'asc',
      limit: '20',
      offset: '0',
    })

    await user.click(within(table).getByText('Severance'))

    expect(await screen.findByText('Why it was held')).toBeInTheDocument()
  })

  it('drives the request from the URL', async () => {
    const { queries } = mockQueue({ rows: history })
    renderPage(
      '/?tab=history&status=rejected&user=1&type=show&trigger=manual_flag&q=far&sort=title&dir=desc&page=2',
    )

    await screen.findByRole('table', { name: 'Decided requests' })
    expect(Object.fromEntries(queries[0])).toEqual({
      status: 'rejected',
      userId: '1',
      contentType: 'show',
      triggeredBy: 'manual_flag',
      search: 'far',
      sortBy: 'contentTitle',
      sortOrder: 'desc',
      limit: '20',
      offset: '20',
    })
    expect(
      screen.getByRole('searchbox', { name: 'Search titles' }),
    ).toHaveValue('far')
    await waitFor(() =>
      expect(
        screen.getByRole('combobox', { name: 'Requested by' }),
      ).toHaveTextContent('Mom'),
    )
    expect(
      screen.getByRole('combobox', { name: 'Content type' }),
    ).toHaveTextContent('Shows')
  })

  it('approves the selection in bulk with notes', async () => {
    const user = userEvent.setup()
    const { bodies } = mockQueue()
    renderPage()
    await screen.findByRole('table', { name: 'Pending requests' })

    await user.click(screen.getByRole('checkbox', { name: 'Select Severance' }))
    await user.click(screen.getByRole('checkbox', { name: 'Select Andor' }))
    expect(within(selectionBar()).getByText('2 selected')).toBeInTheDocument()
    await user.click(
      within(selectionBar()).getByRole('button', { name: 'Approve' }),
    )
    const dialog = await screen.findByRole('dialog', {
      name: 'Approve 2 requests?',
    })
    await user.type(within(dialog).getByLabelText('Notes'), 'Fine by me')
    await user.click(
      within(dialog).getByRole('button', { name: 'Approve 2 requests' }),
    )

    await waitFor(() =>
      expect(bodies.approve).toEqual([
        { requestIds: [1, 3], notes: 'Fine by me' },
      ]),
    )
    await waitFor(() =>
      expect(screen.queryByText('Severance')).not.toBeInTheDocument(),
    )
    expect(
      screen.queryByRole('region', { name: 'Selection' }),
    ).not.toBeInTheDocument()
  })

  it('denies the selection in bulk with a reason', async () => {
    const user = userEvent.setup()
    const { bodies } = mockQueue()
    renderPage()
    await screen.findByRole('table', { name: 'Pending requests' })

    await user.click(screen.getByRole('checkbox', { name: 'Select Andor' }))
    await user.click(
      within(selectionBar()).getByRole('button', { name: 'Deny' }),
    )
    const dialog = await screen.findByRole('dialog', {
      name: 'Deny 1 request?',
    })
    expect(
      within(dialog).getByText('Nothing is sent to Sonarr or Radarr.'),
    ).toBeInTheDocument()
    await user.type(within(dialog).getByLabelText('Reason'), 'Too long')
    await user.click(
      within(dialog).getByRole('button', { name: 'Deny 1 request' }),
    )

    await waitFor(() =>
      expect(bodies.reject).toEqual([{ requestIds: [3], reason: 'Too long' }]),
    )
  })

  it('keeps failed rows selected and shows the alert after a partial failure', async () => {
    const user = userEvent.setup()
    mockQueue({
      result: (ids) => ({
        successful: ids.length - 1,
        failed: [2],
        errors: ['Dune: Part Two: Radarr did not respond in time.'],
        total: ids.length,
      }),
    })
    renderPage()
    await screen.findByRole('table', { name: 'Pending requests' })

    await user.click(
      screen.getByRole('checkbox', { name: 'Select all on this page' }),
    )
    await user.click(
      within(selectionBar()).getByRole('button', { name: 'Approve' }),
    )
    const dialog = await screen.findByRole('dialog', {
      name: 'Approve 3 requests?',
    })
    await user.click(
      within(dialog).getByRole('button', { name: 'Approve 3 requests' }),
    )

    expect(
      await screen.findByText('1 of 3 requests was not approved.'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Dune: Part Two: Radarr did not respond in time.'),
    ).toBeInTheDocument()
    expect(within(selectionBar()).getByText('1 selected')).toBeInTheDocument()
    expect(
      screen.getByRole('checkbox', { name: 'Select Dune: Part Two' }),
    ).toHaveAttribute('aria-checked', 'true')
    await waitFor(() =>
      expect(screen.queryByText('Severance')).not.toBeInTheDocument(),
    )

    await user.click(
      within(selectionBar()).getByRole('button', { name: 'Clear selection' }),
    )
    expect(
      screen.queryByText('1 of 3 requests was not approved.'),
    ).not.toBeInTheDocument()
  })

  it('shows the server message when bulk approve is refused', async () => {
    const user = userEvent.setup()
    mockQueue({ approveStatus: 503 })
    renderPage()
    await screen.findByRole('table', { name: 'Pending requests' })

    await user.click(screen.getByRole('checkbox', { name: 'Select Andor' }))
    await user.click(
      within(selectionBar()).getByRole('button', { name: 'Approve' }),
    )
    await user.click(
      within(
        await screen.findByRole('dialog', { name: 'Approve 1 request?' }),
      ).getByRole('button', { name: 'Approve 1 request' }),
    )

    expect(
      await screen.findByText(
        'Cannot process bulk approval: sonarr instances are unavailable',
      ),
    ).toBeInTheDocument()
    expect(within(selectionBar()).getByText('1 selected')).toBeInTheDocument()
  })

  it('offers approve on history only when every selected row is denied', async () => {
    const user = userEvent.setup()
    mockQueue({ rows: history })
    renderPage('/?tab=history')
    await screen.findByRole('table', { name: 'Decided requests' })

    await user.click(screen.getByRole('checkbox', { name: 'Select Fargo' }))
    await user.click(screen.getByRole('checkbox', { name: 'Select Aftersun' }))
    expect(
      within(selectionBar()).getByRole('button', {
        name: 'Approve 2 requests',
      }),
    ).toBeInTheDocument()
    expect(
      within(selectionBar()).queryByRole('button', { name: 'Deny' }),
    ).not.toBeInTheDocument()

    await user.click(screen.getByRole('checkbox', { name: 'Select Arcane' }))
    expect(
      within(selectionBar()).queryByRole('button', { name: /Approve/ }),
    ).not.toBeInTheDocument()
    expect(
      within(selectionBar()).getByRole('button', { name: 'Delete' }),
    ).toBeInTheDocument()
  })

  it('explains what deleting does before deleting', async () => {
    const user = userEvent.setup()
    const { bodies } = mockQueue({ rows: history })
    renderPage('/?tab=history')
    await screen.findByRole('table', { name: 'Decided requests' })

    await user.click(screen.getByRole('checkbox', { name: 'Select Arcane' }))
    await user.click(screen.getByRole('checkbox', { name: 'Select Fargo' }))
    await user.click(
      within(selectionBar()).getByRole('button', { name: 'Delete' }),
    )
    const dialog = await screen.findByRole('dialog', {
      name: 'Delete 2 requests?',
    })
    expect(
      within(dialog).getByText(
        "Deleting doesn't refuse anything. Waiting and denied titles can come back as new requests, and anything already sent to Radarr or Sonarr stays where it is.",
      ),
    ).toBeInTheDocument()
    await user.click(
      within(dialog).getByRole('button', { name: 'Delete 2 requests' }),
    )

    await waitFor(() =>
      expect(bodies.delete).toEqual([{ requestIds: [11, 13] }]),
    )
  })

  it('shows the history counts from the stats', async () => {
    mockQueue({ rows: history })
    renderPage('/?tab=history')

    const status = await screen.findByRole('group', { name: 'Status' })
    expect(within(status).getByText('412')).toBeInTheDocument()
    expect(within(status).getByText('37')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Pending/ })).toHaveTextContent('3')
  })

  it('hides the history counts while a filter is set', async () => {
    mockQueue({ rows: history })
    renderPage('/?tab=history&q=far')

    await screen.findByRole('table', { name: 'Decided requests' })
    const status = screen.getByRole('group', { name: 'Status' })
    expect(within(status).getByText('Denied')).toBeInTheDocument()
    expect(within(status).queryByText('412')).not.toBeInTheDocument()
    expect(within(status).queryByText('37')).not.toBeInTheDocument()
  })

  it('keeps the table on a phone and moves filters into a drawer', async () => {
    const user = userEvent.setup()
    stubViewport({ mobile: true })
    mockQueue()
    renderPage('/?user=1')

    const table = await screen.findByRole('table', { name: 'Pending requests' })
    expect(
      within(table).getByRole('columnheader', { name: /Trigger/ }),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('checkbox', { name: 'Select Andor' }))
    expect(within(selectionBar()).getByText('1 selected')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /^Filters/ }))
    const drawer = await screen.findByRole('dialog', { name: 'Filters' })
    expect(within(drawer).queryByLabelText('Sort by')).not.toBeInTheDocument()
    expect(
      within(drawer).getByRole('button', { name: 'Show 3 requests' }),
    ).toBeInTheDocument()
  })

  it('says all caught up with no toolbar when nothing is pending', async () => {
    mockQueue({ rows: [] })
    renderPage()

    expect(await screen.findByText('All caught up')).toBeInTheDocument()
    expect(
      screen.queryByRole('searchbox', { name: 'Search titles' }),
    ).not.toBeInTheDocument()
  })
})
