import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { MemoryRouter } from 'react-router-dom'
import { ApprovalsCard } from '@/features/home/components/approvals-card'
import { setFormatLocale } from '@/lib/format'
import { NAV_PAGES, pageHref } from '@/lib/navigation'
import { queryClient } from '@/lib/queryClient'
import type { components } from '@/types/api.js'
import {
  makeApproval,
  mockApprovalEndpoints,
} from '../../../approval-fixtures.js'
import { server } from '../../../setup.js'
import { stubViewport } from '../../../viewport.js'

type ApprovalRequest = components['schemas']['ApprovalRequest']

function mockQueue(requests: ApprovalRequest[], total = requests.length) {
  const sortOrders: Array<string | null> = []
  server.use(
    http.get('/v1/approval/requests', ({ request }) => {
      sortOrders.push(new URL(request.url).searchParams.get('sortOrder'))
      return HttpResponse.json({
        success: true,
        message: 'ok',
        approvalRequests: requests,
        total,
        limit: 1000,
        offset: 0,
      })
    }),
  )
  return sortOrders
}

function pendingQueue(count: number): ApprovalRequest[] {
  return Array.from({ length: count }, (_, index) =>
    makeApproval({ id: index + 1, contentTitle: `Title ${index + 1}` }),
  )
}

function renderCard() {
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ApprovalsCard />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('ApprovalsCard', () => {
  beforeEach(() => {
    setFormatLocale('en-US')
    stubViewport({ mobile: false })
  })

  afterEach(() => {
    queryClient.clear()
    setFormatLocale(undefined)
    vi.unstubAllGlobals()
  })

  it('lists rows with the trigger, a count badge and no inline decisions', async () => {
    const approval = makeApproval({
      expiresAt: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
      timeUntilExpiration: 3 * 60 * 60 * 1000,
      expirationStatus: 'expiring_soon',
    })
    mockApprovalEndpoints(approval)
    mockQueue([approval], 12)
    renderCard()

    const row = await screen.findByRole('button', { name: 'Review Severance' })
    expect(within(row).getByText('Severance')).toBeInTheDocument()
    expect(
      within(row).getByText('Show, requested by sarah, 2 hours ago'),
    ).toBeInTheDocument()
    expect(
      within(row).getByText('Weekly quota: 5 of 5 shows used'),
    ).toBeInTheDocument()
    expect(within(row).getByText('Expires in 3 hours')).toBeInTheDocument()
    expect(screen.getByText('12')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /^(Approve|Deny)$/ }),
    ).not.toBeInTheDocument()
  })

  it('opens the review panel for a row', async () => {
    const user = userEvent.setup()
    const approval = makeApproval()
    mockApprovalEndpoints(approval)
    mockQueue([approval])
    renderCard()

    await user.click(
      await screen.findByRole('button', { name: 'Review Severance' }),
    )

    const dialog = await screen.findByRole('dialog')
    expect(
      await within(dialog).findByText('Why it was held'),
    ).toBeInTheDocument()
    expect(
      within(dialog).getByRole('button', { name: 'Approve' }),
    ).toBeInTheDocument()
  })

  it('hides the count when nothing is waiting', async () => {
    mockQueue([])
    renderCard()

    expect(await screen.findByText(/All caught up/)).toBeInTheDocument()
    expect(screen.queryByText('0')).not.toBeInTheDocument()
  })

  it('links the header to the approval queue page', async () => {
    mockQueue([])
    renderCard()

    expect(
      await screen.findByRole('button', {
        name: NAV_PAGES.approvalQueue.label,
      }),
    ).toHaveAttribute('href', pageHref(NAV_PAGES.approvalQueue))
  })

  it('requests oldest first by default and persists a switch to newest', async () => {
    const user = userEvent.setup()
    const sortOrders = mockQueue(pendingQueue(2))
    renderCard()

    await screen.findByRole('button', { name: 'Review Title 1' })
    expect(sortOrders).toEqual(['asc'])

    await user.click(screen.getByLabelText('Sort order'))
    await user.click(
      await screen.findByRole('option', { name: 'Newest first' }),
    )

    await vi.waitFor(() => expect(sortOrders).toContain('desc'))
    expect(localStorage.getItem('pulsarr-approvals-sort')).toBe('newest')
    expect(screen.getByLabelText('Sort order')).toHaveTextContent(
      'Newest first',
    )
  })

  it('caps the card at four rows and lists every request in View all', async () => {
    const user = userEvent.setup()
    mockQueue(pendingQueue(7))
    renderCard()

    expect(
      await screen.findByRole('button', { name: 'Review Title 4' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Review Title 5' }),
    ).not.toBeInTheDocument()
    expect(screen.getByText('+3 more waiting')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'View all' }))

    const dialog = await screen.findByRole('dialog', {
      name: 'Needs your approval',
    })
    expect(dialog).toHaveAccessibleDescription('7 requests waiting')
    expect(
      within(dialog).getAllByRole('button', { name: /^Review Title/ }),
    ).toHaveLength(7)
  })

  it('opens the review panel from a View all row', async () => {
    const user = userEvent.setup()
    mockApprovalEndpoints(makeApproval({ id: 6, contentTitle: 'Title 6' }))
    mockQueue(pendingQueue(6))
    renderCard()

    await user.click(await screen.findByRole('button', { name: 'View all' }))
    const list = await screen.findByRole('dialog', {
      name: 'Needs your approval',
    })
    await user.click(
      within(list).getByRole('button', { name: 'Review Title 6' }),
    )

    expect(await screen.findByText('Why it was held')).toBeInTheDocument()
  })

  it('hides the overflow footer at four requests or fewer', async () => {
    mockQueue(pendingQueue(4))
    renderCard()

    expect(
      await screen.findByRole('button', { name: 'Review Title 4' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'View all' }),
    ).not.toBeInTheDocument()
    expect(screen.queryByText(/more waiting/)).not.toBeInTheDocument()
  })

  it('hides the sort select when nothing is waiting', async () => {
    mockQueue([])
    renderCard()

    expect(await screen.findByText(/All caught up/)).toBeInTheDocument()
    expect(screen.queryByLabelText('Sort order')).not.toBeInTheDocument()
  })
})
