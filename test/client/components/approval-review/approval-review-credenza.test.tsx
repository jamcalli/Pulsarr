import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { ApprovalReviewCredenza } from '@/components/approval-review/approval-review-credenza'
import { formatTimestamp, setFormatLocale } from '@/lib/format'
import { queryClient } from '@/lib/queryClient'
import type { components } from '@/types/api.js'
import {
  makeApproval,
  mockApprovalEndpoints,
  mockQuotaConfig,
  sonarrRouting,
} from '../../approval-fixtures.js'
import { server } from '../../setup.js'
import { stubViewport } from '../../viewport.js'

type ApprovalRequest = components['schemas']['ApprovalRequest']
type RouterRule = components['schemas']['RouterRule']
type ShowDetails = components['schemas']['TmdbTvDetails']

const severance: ShowDetails = {
  adult: false,
  backdrop_path: null,
  created_by: [],
  episode_run_time: [50],
  first_air_date: '2022-02-18',
  genres: [],
  homepage: null,
  id: 95396,
  in_production: true,
  languages: ['en'],
  last_air_date: '2025-03-21',
  last_episode_to_air: null,
  name: 'Severance',
  next_episode_to_air: null,
  networks: [],
  number_of_episodes: 30,
  number_of_seasons: 3,
  origin_country: ['US'],
  original_language: 'en',
  original_name: 'Severance',
  overview: 'Office workers have their memories surgically divided.',
  popularity: 1,
  poster_path: null,
  production_companies: [],
  production_countries: [],
  seasons: [],
  spoken_languages: [],
  status: 'Returning Series',
  tagline: null,
  type: 'Scripted',
  vote_average: 8.4,
  vote_count: 2000,
}

const severanceGuids = ['tmdb:95396', 'tvdb:371980']

function mockMetadata(status: 200 | 404 = 200) {
  const requested: string[] = []
  server.use(
    http.get('/v1/tmdb/regions', () =>
      HttpResponse.json({
        success: true,
        message: 'ok',
        regions: [{ code: 'US', name: 'United States' }],
      }),
    ),
    http.get('/v1/tmdb/metadata/:id', ({ params }) => {
      requested.push(String(params.id))
      return status === 404
        ? HttpResponse.json(
            {
              statusCode: 404,
              error: 'Not Found',
              message: 'No metadata found for tvdb:371980',
            },
            { status: 404 },
          )
        : HttpResponse.json({
            success: true,
            message: 'ok',
            metadata: { details: severance, watchProviders: {} },
          })
    }),
  )
  return requested
}

function reviewElement(approvalId: number, open: boolean) {
  return (
    <QueryClientProvider client={queryClient}>
      <ApprovalReviewCredenza
        approvalId={approvalId}
        open={open}
        onOpenChange={() => undefined}
      />
    </QueryClientProvider>
  )
}

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
    mockQuotaConfig()
  })

  afterEach(() => {
    queryClient.clear()
    setFormatLocale(undefined)
    vi.unstubAllGlobals()
  })

  it('shows a pending request read only with its notes field', async () => {
    const approval = makeApproval()
    renderReview(approval)
    const dialog = await findDialog()

    expect(
      within(dialog).getByRole('heading', { name: 'Severance' }),
    ).toBeInTheDocument()
    expect(within(dialog).getByText('Pending approval')).toBeInTheDocument()
    expect(
      within(dialog).getByText(
        `Show, requested by sarah, ${formatTimestamp(new Date(approval.createdAt))}`,
      ),
    ).toBeInTheDocument()
    expect(
      within(dialog).getByText('Weekly rolling quota: 5 of 5 shows used'),
    ).toBeInTheDocument()
    expect(
      await within(dialog).findByText(
        'sarah has requested 5 shows in the last 10 days.',
      ),
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
    ['expired', 'Expired', 'Where it would have gone'],
  ] as const)(
    'shows a %s request with only delete in the footer',
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
      expect(
        within(dialog).getByRole('button', { name: 'Delete' }),
      ).toBeEnabled()
    },
  )

  it('deletes a request after confirming and closes', async () => {
    const user = userEvent.setup()
    const approval = makeApproval({ status: 'approved' })
    mockApprovalEndpoints(approval)
    let deleted = false
    server.use(
      http.delete('/v1/approval/requests/:id', () => {
        deleted = true
        return HttpResponse.json({ success: true, message: 'ok' })
      }),
    )
    const onOpenChange = vi.fn()
    render(
      <QueryClientProvider client={queryClient}>
        <ApprovalReviewCredenza
          approvalId={approval.id}
          open
          onOpenChange={onOpenChange}
        />
      </QueryClientProvider>,
    )
    const dialog = await findDialog()

    await user.click(within(dialog).getByRole('button', { name: 'Delete' }))
    expect(within(dialog).getByText('Delete this request?')).toBeInTheDocument()
    expect(
      within(dialog).getByText(/Deleting doesn't refuse anything/),
    ).toBeInTheDocument()
    expect(deleted).toBe(false)
    await user.click(
      within(dialog).getByRole('button', { name: 'Delete request' }),
    )

    await vi.waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    expect(deleted).toBe(true)
  })

  it('cancels a delete without sending it', async () => {
    const user = userEvent.setup()
    renderReview(makeApproval())
    const dialog = await findDialog()

    await user.click(within(dialog).getByRole('button', { name: 'Delete' }))
    expect(within(dialog).getByText('Delete this request?')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))

    expect(
      within(dialog).queryByText('Delete this request?'),
    ).not.toBeInTheDocument()
    expect(
      within(dialog).getByRole('button', { name: 'Approve' }),
    ).toBeInTheDocument()
  })

  it('lists the stored ids under the requester', async () => {
    renderReview(
      makeApproval({
        contentGuids: ['imdb:tt4301160', 'tmdb:155537', 'tvdb:401998'],
      }),
    )
    const dialog = await findDialog()

    expect(
      within(dialog).getByText('imdb tt4301160, tmdb 155537, tvdb 401998'),
    ).toBeInTheDocument()
  })

  it('offers a denied request approve with notes and no deny', async () => {
    const user = userEvent.setup()
    const approval = makeApproval({
      status: 'rejected',
      approvalNotes: 'Quota resets on the 1st',
    })
    mockApprovalEndpoints(approval)
    const bodies: unknown[] = []
    server.use(
      http.post('/v1/approval/requests/:id/approve', async ({ request }) => {
        bodies.push(await request.json())
        return HttpResponse.json({
          success: true,
          message: 'ok',
          approvalRequest: { ...approval, status: 'approved' },
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

    expect(within(dialog).getByText('Decision')).toBeInTheDocument()
    expect(
      within(dialog).getByText('Quota resets on the 1st'),
    ).toBeInTheDocument()
    expect(
      within(dialog).queryByRole('button', { name: 'Deny' }),
    ).not.toBeInTheDocument()
    expect(
      within(dialog).getByRole('button', { name: 'Edit routing' }),
    ).toBeInTheDocument()

    await user.type(
      within(dialog).getByLabelText(/Notes \(for your records\)/),
      'Second look',
    )
    await user.click(within(dialog).getByRole('button', { name: 'Approve' }))

    await vi.waitFor(() => expect(bodies).toEqual([{ notes: 'Second look' }]))
  })

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

    const line = await within(dialog).findByRole('listitem')
    expect(within(dialog).getByText('Other destinations')).toBeInTheDocument()
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

  it('still lists each additional destination when the rules fail to load', async () => {
    const approval = withAdditional(makeApproval())
    mockApprovalEndpoints(approval)
    server.use(
      http.get('/v1/content-router/rules', () =>
        HttpResponse.json(
          {
            statusCode: 500,
            error: 'Internal Server Error',
            message: 'Rules unavailable',
          },
          { status: 500 },
        ),
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

    const line = await within(dialog).findByRole(
      'listitem',
      {},
      { timeout: 3000 },
    )
    await vi.waitFor(() =>
      expect(line).toHaveTextContent('Sonarr 4K, Ultra-HD, /tv-2'),
    )
    expect(
      within(line).getByRole('button', { name: 'Remove Sonarr 4K' }),
    ).toBeInTheDocument()
    expect(line).not.toHaveTextContent('Rule:')
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
    const expiresAt = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString()
    renderReview(
      makeApproval({
        expiresAt,
        timeUntilExpiration: 3 * 60 * 60 * 1000,
        expirationStatus: 'expiring_soon',
      }),
    )
    const dialog = await findDialog()

    expect(
      within(dialog).getByText(
        `Expires ${formatTimestamp(new Date(expiresAt))}`,
      ),
    ).toBeInTheDocument()
  })
  it.each([
    ['show', 'Show info'],
    ['movie', 'Movie info'],
  ] as const)('labels the %s info toggle %s', async (contentType, label) => {
    renderReview(makeApproval({ contentType }))
    const dialog = await findDialog()

    const toggle = within(dialog).getByRole('group', { name: 'View' })
    expect(
      within(toggle).getByRole('button', { name: 'Review' }),
    ).toHaveAttribute('aria-pressed', 'true')
    expect(within(toggle).getByRole('button', { name: label })).toBeVisible()
  })

  it('loads the show facts only once info is selected and keeps the decision in reach', async () => {
    const user = userEvent.setup()
    const requested = mockMetadata()
    renderReview(makeApproval({ contentGuids: severanceGuids }))
    const dialog = await findDialog()
    await within(dialog).findByText('Sonarr 4K')
    expect(requested).toEqual([])

    await user.click(within(dialog).getByRole('button', { name: 'Show info' }))

    expect(await within(dialog).findByText('Seasons')).toBeInTheDocument()
    expect(within(dialog).getByText('3')).toBeInTheDocument()
    expect(
      within(dialog).getByText('30, about 10 per season'),
    ).toBeInTheDocument()
    expect(requested).toEqual(['tvdb:371980'])
    expect(
      within(dialog).getByRole('heading', { name: 'Severance' }),
    ).toBeInTheDocument()
    expect(within(dialog).queryByText('Why it was held')).not.toBeVisible()
    expect(
      within(dialog).getByRole('button', { name: 'Approve' }),
    ).toBeEnabled()
  })

  it('keeps typed notes when switching back to the review', async () => {
    const user = userEvent.setup()
    mockMetadata()
    renderReview(makeApproval({ contentGuids: severanceGuids }))
    const dialog = await findDialog()

    await user.type(
      within(dialog).getByLabelText(/Notes \(for your records\)/),
      'Fine by me',
    )
    await user.click(within(dialog).getByRole('button', { name: 'Show info' }))
    await within(dialog).findByText('Seasons')
    await user.click(within(dialog).getByRole('button', { name: 'Review' }))

    expect(within(dialog).queryByText('Seasons')).not.toBeInTheDocument()
    expect(within(dialog).getByText('Why it was held')).toBeVisible()
    expect(
      within(dialog).getByLabelText(/Notes \(for your records\)/),
    ).toHaveValue('Fine by me')
  })

  it('shows the empty state when TMDB has no entry', async () => {
    const user = userEvent.setup()
    mockMetadata(404)
    renderReview(makeApproval({ contentGuids: severanceGuids }))
    const dialog = await findDialog()

    await user.click(within(dialog).getByRole('button', { name: 'Show info' }))

    expect(
      await within(dialog).findByText('No details available'),
    ).toBeInTheDocument()
  })

  it('returns to the review when the dialog reopens', async () => {
    const user = userEvent.setup()
    mockMetadata()
    const approval = makeApproval({ contentGuids: severanceGuids })
    mockApprovalEndpoints(approval)
    const { rerender } = render(reviewElement(approval.id, true))
    const dialog = await findDialog()
    await user.click(within(dialog).getByRole('button', { name: 'Show info' }))
    await within(dialog).findByText('Seasons')

    rerender(reviewElement(approval.id, false))
    await vi.waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    )
    rerender(reviewElement(approval.id, true))

    const reopened = await findDialog()
    expect(within(reopened).getByText('Why it was held')).toBeVisible()
    expect(within(reopened).queryByText('Seasons')).not.toBeInTheDocument()
    expect(
      within(reopened).getByRole('button', { name: 'Review' }),
    ).toHaveAttribute('aria-pressed', 'true')
  })

  it('returns to the review when another approval loads', async () => {
    const user = userEvent.setup()
    mockMetadata()
    const first = makeApproval({ contentGuids: severanceGuids })
    const second = makeApproval({
      id: 8,
      contentTitle: 'Andor',
      contentGuids: ['tvdb:393189'],
    })
    mockApprovalEndpoints(first)
    server.use(
      http.get('/v1/approval/requests/:id', ({ params }) =>
        HttpResponse.json({
          success: true,
          message: 'ok',
          approvalRequest: Number(params.id) === second.id ? second : first,
        }),
      ),
    )
    const { rerender } = render(reviewElement(first.id, true))
    const dialog = await findDialog()
    await user.click(within(dialog).getByRole('button', { name: 'Show info' }))
    await within(dialog).findByText('Seasons')

    rerender(reviewElement(second.id, true))

    expect(
      await screen.findByRole('heading', { name: 'Andor' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Why it was held')).toBeVisible()
    expect(screen.queryByText('Seasons')).not.toBeInTheDocument()
  })
})
