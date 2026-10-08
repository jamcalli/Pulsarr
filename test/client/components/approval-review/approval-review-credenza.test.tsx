import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { ApprovalReviewCredenza } from '@/components/approval-review/approval-review-credenza'
import { setFormatLocale } from '@/lib/format'
import { queryClient } from '@/lib/queryClient'
import type { components } from '@/types/api.js'
import {
  makeApproval,
  mockApprovalEndpoints,
  sonarrRouting,
} from '../../approval-fixtures.js'
import { server } from '../../setup.js'
import { stubViewport } from '../../viewport.js'

type ApprovalRequest = components['schemas']['ApprovalRequest']
type RouterRule = components['schemas']['RouterRule']

function renderReview(approval: ApprovalRequest) {
  mockApprovalEndpoints(approval)
  return render(
    <QueryClientProvider client={queryClient}>
      <ApprovalReviewCredenza
        approvalId={approval.id}
        open
        onOpenChange={() => undefined}
      />
    </QueryClientProvider>,
  )
}

const anime4k: RouterRule = {
  id: 12,
  name: 'Anime 4K',
  target_type: 'sonarr',
  target_instance_id: 2,
  order: 60,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
}

function withAdditional(approval: ApprovalRequest): ApprovalRequest {
  const decision = approval.proposedRouterDecision
  return {
    ...approval,
    proposedRouterDecision: {
      ...decision,
      approval: decision.approval && {
        ...decision.approval,
        additionalRouting: [
          {
            ...sonarrRouting,
            instanceId: 2,
            qualityProfile: 8,
            rootFolder: '/tv-2',
            syncedInstances: undefined,
            ruleId: 12,
          },
        ],
      },
    },
  }
}

async function findDialog() {
  await screen.findByText('Why it was held')
  return screen.getByRole('dialog')
}

describe('ApprovalReviewCredenza', () => {
  beforeEach(() => {
    setFormatLocale('en-US')
    stubViewport({ mobile: false })
  })

  afterEach(() => {
    queryClient.clear()
    setFormatLocale(undefined)
    vi.unstubAllGlobals()
  })

  it('shows a pending request read only with its notes field', async () => {
    renderReview(makeApproval())
    const dialog = await findDialog()

    expect(
      within(dialog).getByRole('heading', { name: 'Severance' }),
    ).toBeInTheDocument()
    expect(within(dialog).getByText('Pending approval')).toBeInTheDocument()
    expect(
      within(dialog).getByText('Show, requested by sarah, 2 hours ago'),
    ).toBeInTheDocument()
    expect(
      within(dialog).getByText('Weekly quota: 5 of 5 shows used'),
    ).toBeInTheDocument()
    expect(within(dialog).getByText('Where it will go')).toBeInTheDocument()
    expect(await within(dialog).findByText('HD-1080p')).toBeInTheDocument()
    expect(within(dialog).getByText('Default')).toBeInTheDocument()
    expect(await within(dialog).findByText('Sonarr 4K')).toBeInTheDocument()
    expect(within(dialog).getByText('/tv')).toBeInTheDocument()
    expect(
      within(dialog).getByText('Search as soon as it is added'),
    ).toBeInTheDocument()
    expect(
      within(dialog).getByLabelText(/Notes \(for your records\)/),
    ).toBeInTheDocument()
    expect(
      within(dialog).getByRole('button', { name: 'Approve' }),
    ).toBeEnabled()
    expect(
      within(dialog).getByRole('button', { name: 'Edit routing' }),
    ).toBeInTheDocument()
  })

  it('swaps notes for the reason and footer on deny', async () => {
    const user = userEvent.setup()
    renderReview(makeApproval())
    const dialog = await findDialog()
    await within(dialog).findByText('Sonarr 4K')

    await user.click(within(dialog).getByRole('button', { name: 'Deny' }))

    expect(within(dialog).getByText('Deny this request?')).toBeInTheDocument()
    expect(
      within(dialog).getByText(
        'Nothing is sent to Sonarr. The request moves to your history as denied.',
      ),
    ).toBeInTheDocument()
    expect(
      within(dialog).getByLabelText(/Reason \(for your records\)/),
    ).toBeInTheDocument()
    expect(
      within(dialog).queryByLabelText(/Notes \(for your records\)/),
    ).not.toBeInTheDocument()
    expect(
      within(dialog).getByRole('button', { name: 'Deny request' }),
    ).toBeInTheDocument()
    expect(
      within(dialog).queryByRole('button', { name: 'Approve' }),
    ).not.toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(
      within(dialog).getByRole('button', { name: 'Approve' }),
    ).toBeInTheDocument()
  })

  it('closes and reports the decision after approving', async () => {
    const user = userEvent.setup()
    const approval = makeApproval()
    mockApprovalEndpoints(approval)
    server.use(
      http.post('/v1/approval/requests/:id/approve', () =>
        HttpResponse.json({
          success: true,
          message: 'ok',
          approvalRequest: { ...approval, status: 'approved' },
        }),
      ),
    )
    const onOpenChange = vi.fn()
    const onDecided = vi.fn()
    render(
      <QueryClientProvider client={queryClient}>
        <ApprovalReviewCredenza
          approvalId={approval.id}
          open
          onOpenChange={onOpenChange}
          onDecided={onDecided}
        />
      </QueryClientProvider>,
    )
    const dialog = await findDialog()

    await user.click(within(dialog).getByRole('button', { name: 'Approve' }))

    await vi.waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    expect(onDecided).toHaveBeenCalledOnce()
  })

  it('blocks approve when no routing was saved', async () => {
    renderReview(makeApproval({}, null))
    const dialog = await findDialog()

    expect(
      within(dialog).getByText('No routing was saved with this request'),
    ).toBeInTheDocument()
    expect(
      within(dialog).getByText('Set routing to approve.'),
    ).toBeInTheDocument()
    expect(
      within(dialog).getByRole('button', { name: 'Approve' }),
    ).toBeDisabled()
  })

  it.each([
    ['approved', 'Approved', 'Where it went'],
    ['auto_approved', 'Auto approved', 'Where it went'],
    ['rejected', 'Denied', 'Where it would have gone'],
    ['expired', 'Expired', 'Where it would have gone'],
  ] as const)(
    'shows a %s request without a footer',
    async (status, label, heading) => {
      renderReview(makeApproval({ status, approvalNotes: 'Kept for later' }))
      const dialog = await findDialog()

      expect(within(dialog).getByText(heading)).toBeInTheDocument()
      expect(within(dialog).getByText('Decision')).toBeInTheDocument()
      expect(within(dialog).getAllByText(label).length).toBeGreaterThan(0)
      expect(within(dialog).getByText('Kept for later')).toBeInTheDocument()
      expect(
        within(dialog).queryByRole('button', {
          name: /Approve|Deny|Edit routing|Set routing/,
        }),
      ).not.toBeInTheDocument()
      expect(
        within(dialog).queryByLabelText(/for your records/),
      ).not.toBeInTheDocument()
    },
  )

  it('lists each additional destination and removes one', async () => {
    const user = userEvent.setup()
    const approval = withAdditional(makeApproval())
    const bodies: unknown[] = []
    mockApprovalEndpoints(approval)
    server.use(
      http.get('/v1/content-router/rules', () =>
        HttpResponse.json({ success: true, message: 'ok', rules: [anime4k] }),
      ),
      http.patch('/v1/approval/requests/:id', async ({ request }) => {
        bodies.push(await request.json())
        return HttpResponse.json({
          success: true,
          message: 'ok',
          approvalRequest: makeApproval(),
        })
      }),
    )
    render(
      <QueryClientProvider client={queryClient}>
        <ApprovalReviewCredenza
          approvalId={approval.id}
          open
          onOpenChange={() => undefined}
        />
      </QueryClientProvider>,
    )
    const dialog = await findDialog()

    expect(
      await within(dialog).findByText('Other destinations'),
    ).toBeInTheDocument()
    const line = await within(dialog).findByRole('listitem')
    await vi.waitFor(() =>
      expect(line).toHaveTextContent('Sonarr 4K, Ultra-HD, /tv-2'),
    )
    expect(line).toHaveTextContent('Rule: Anime 4K')

    await user.click(
      within(line).getByRole('button', { name: 'Remove Sonarr 4K' }),
    )

    await vi.waitFor(() => expect(bodies).toHaveLength(1))
    expect(bodies[0]).toMatchObject({
      proposedRouterDecision: {
        action: 'require_approval',
        approval: { proposedRouting: sonarrRouting, additionalRouting: [] },
      },
    })
    await vi.waitFor(() =>
      expect(within(dialog).queryByRole('listitem')).not.toBeInTheDocument(),
    )
  })

  it('lists where an approved request also went without remove controls', async () => {
    const approval = withAdditional(makeApproval({ status: 'approved' }))
    mockApprovalEndpoints(approval)
    server.use(
      http.get('/v1/content-router/rules', () =>
        HttpResponse.json({ success: true, message: 'ok', rules: [anime4k] }),
      ),
    )
    render(
      <QueryClientProvider client={queryClient}>
        <ApprovalReviewCredenza
          approvalId={approval.id}
          open
          onOpenChange={() => undefined}
        />
      </QueryClientProvider>,
    )
    const dialog = await findDialog()

    const line = await within(dialog).findByRole('listitem')
    await vi.waitFor(() => expect(line).toHaveTextContent('Rule: Anime 4K'))
    expect(within(line).queryByRole('button')).not.toBeInTheDocument()
  })

  it('shows the type placeholder when there is no poster', async () => {
    renderReview(makeApproval({ thumb: null }))
    const dialog = await findDialog()

    expect(
      dialog.querySelector('[data-slot="poster-placeholder"]'),
    ).toBeInTheDocument()
    expect(dialog.querySelector('img[src*="severance"]')).toBeNull()
  })

  it('flags a request that expires soon', async () => {
    renderReview(
      makeApproval({
        expiresAt: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
        timeUntilExpiration: 3 * 60 * 60 * 1000,
        expirationStatus: 'expiring_soon',
      }),
    )
    const dialog = await findDialog()

    expect(within(dialog).getByText('Expires in 3 hours')).toBeInTheDocument()
  })
})
