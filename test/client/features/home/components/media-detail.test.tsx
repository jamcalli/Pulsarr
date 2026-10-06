import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { MediaDetail } from '@/features/home/components/media-detail/media-detail'
import type { RecentRequest } from '@/features/home/hooks/useRecentRequests'
import type { MediaItem } from '@/features/home/lib/media-item'
import { setFormatLocale } from '@/lib/format'
import { queryClient } from '@/lib/queryClient'
import {
  makeApproval,
  mockApprovalEndpoints,
} from '../../../approval-fixtures.js'
import { server } from '../../../setup.js'
import { stubViewport } from '../../../viewport.js'

const movieDetails = {
  adult: false,
  backdrop_path: '/backdrop.jpg',
  belongs_to_collection: null,
  budget: 165000000,
  genres: [{ id: 878, name: 'Science Fiction' }],
  homepage: '',
  id: 438631,
  imdb_id: 'tt1160419',
  origin_country: ['US'],
  original_language: 'en',
  original_title: 'Dune',
  overview: 'Paul Atreides travels to Arrakis.',
  popularity: 100,
  poster_path: '/poster.jpg',
  production_companies: [],
  production_countries: [],
  release_date: '2021-09-15',
  revenue: 402000000,
  runtime: 155,
  spoken_languages: [],
  status: 'Released',
  tagline: null,
  title: 'Dune',
  video: false,
  vote_average: 7.8,
  vote_count: 12000,
}

const flatrate = [
  {
    display_priority: 1,
    logo_path: '/max.png',
    provider_id: 1899,
    provider_name: 'Max',
  },
]

function mockEndpoints({ providers }: { providers: boolean }) {
  server.use(
    http.get('/v1/config', () =>
      HttpResponse.json({ success: true, config: { tmdbRegion: 'US' } }),
    ),
    http.get('/v1/tmdb/regions', () =>
      HttpResponse.json({
        success: true,
        message: 'ok',
        regions: [
          { code: 'US', name: 'United States' },
          { code: 'CA', name: 'Canada' },
        ],
      }),
    ),
    http.get('/v1/approval/requests', () =>
      HttpResponse.json({
        success: true,
        message: 'ok',
        approvalRequests: [],
        total: 0,
        limit: 5,
        offset: 0,
      }),
    ),
    http.get('/v1/tmdb/metadata/:id', () =>
      HttpResponse.json({
        success: true,
        message: 'ok',
        metadata: {
          details: movieDetails,
          watchProviders: providers ? { flatrate } : {},
          radarrRatings: {
            imdb: { votes: 900000, value: 8, type: 'user' },
            metacritic: { votes: 0, value: 74, type: 'critic' },
          },
          plexRatings: { rtCritic: 8.3, rtAudience: 9 },
        },
      }),
    ),
  )
}

function mockMetadataError(status: 404 | 500) {
  server.use(
    http.get('/v1/tmdb/metadata/:id', () =>
      HttpResponse.json(
        {
          statusCode: status,
          error: status === 404 ? 'Not Found' : 'Internal Server Error',
          message:
            status === 404
              ? 'No metadata found for tvdb:389492'
              : 'Internal Server Error',
        },
        { status },
      ),
    ),
  )
}

function request(overrides: Partial<RecentRequest> = {}): RecentRequest {
  return {
    id: 3,
    source: 'watchlist',
    title: 'Dune',
    contentType: 'movie',
    guids: ['tmdb:438631', 'imdb:tt1160419'],
    thumb: null,
    status: 'requested',
    userId: 1,
    userName: 'jamie',
    createdAt: new Date().toISOString(),
    primaryInstance: null,
    allInstances: [
      {
        id: 1,
        name: 'Radarr',
        instanceType: 'radarr',
        status: 'requested',
        junctionStatus: 'requested',
      },
    ],
    ...overrides,
  }
}

function renderDetail(
  item: MediaItem,
  onOpenChange: (open: boolean) => void = () => undefined,
) {
  const router = createMemoryRouter([
    {
      path: '*',
      element: <MediaDetail open onOpenChange={onOpenChange} item={item} />,
    },
  ])
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

const TWO_DAYS = 2 * 24 * 60 * 60 * 1000

function pendingDune() {
  return makeApproval({
    id: 11,
    contentType: 'movie',
    contentTitle: 'Dune',
    expiresAt: new Date(Date.now() + TWO_DAYS + 60_000).toISOString(),
    timeUntilExpiration: TWO_DAYS,
  })
}

function sectionTitled(name: string) {
  const section = screen.getByRole('heading', { name }).closest('section')
  if (!section) throw new Error(`No section titled ${name}`)
  return section
}

function itemFor(req: RecentRequest): MediaItem {
  return {
    title: req.title,
    type: req.contentType,
    guids: req.guids,
    thumb: req.thumb,
    request: req,
  }
}

describe('MediaDetail', () => {
  beforeEach(() => {
    setFormatLocale('en-US')
    stubViewport({ mobile: false })
  })

  afterEach(() => {
    queryClient.clear()
    setFormatLocale(undefined)
    vi.unstubAllGlobals()
  })

  it('renders the title, ratings and providers', async () => {
    mockEndpoints({ providers: true })
    renderDetail(itemFor(request()))

    expect(await screen.findByText('Max')).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'Dune', level: 2 }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^TMDB / })).toHaveTextContent(
      '7.8/10',
    )
    expect(screen.getByRole('button', { name: /^IMDb / })).toHaveTextContent(
      '8.0/10',
    )
    expect(
      screen.getByRole('button', { name: /^Rotten Tomatoes critics / }),
    ).toHaveTextContent('83%')
    expect(
      screen.getByRole('button', { name: /^Metacritic / }),
    ).toHaveTextContent('74/100')
    expect(screen.getByText('Streaming')).toBeInTheDocument()
    expect(screen.getByText('Sent to Radarr')).toBeInTheDocument()
    expect(screen.getByText('Downloaded')).toBeInTheDocument()
    expect(screen.getByText('$402,000,000')).toBeInTheDocument()
  })

  it('reviews a pending request beside the journey and approves from the footer', async () => {
    const user = userEvent.setup()
    const approval = pendingDune()
    mockEndpoints({ providers: true })
    mockApprovalEndpoints(approval)
    const approved = vi.fn()
    server.use(
      http.post('/v1/approval/requests/:id/approve', ({ params }) => {
        approved(params.id)
        return HttpResponse.json({
          success: true,
          message: 'ok',
          approvalRequest: { ...approval, status: 'approved' },
        })
      }),
    )
    const onOpenChange = vi.fn()
    renderDetail(
      itemFor(
        request({
          source: 'approval',
          id: 11,
          status: 'pending_approval',
          allInstances: [],
        }),
      ),
      onOpenChange,
    )

    expect(await screen.findByText('Why it was held')).toBeInTheDocument()
    expect(await screen.findByText('Max')).toBeInTheDocument()
    const journey = sectionTitled('In Pulsarr')
    const grid = journey.parentElement
    expect(grid).toContainElement(
      screen.getByRole('heading', { name: 'Why it was held' }),
    )
    expect(grid).toContainElement(screen.getByText('Where it will go'))
    expect(grid).not.toContainElement(
      screen.getByRole('heading', { name: 'About' }),
    )
    expect(within(journey).getByText('Expires in 2 days')).toBeInTheDocument()

    const approve = screen.getByRole('button', { name: 'Approve' })
    await vi.waitFor(() => expect(approve).toBeEnabled())
    await user.click(approve)

    await vi.waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    expect(approved).toHaveBeenCalledWith('11')
    expect(screen.getByRole('button', { name: 'Deny' })).toBeInTheDocument()
  })

  it('asks before closing with unsaved routing changes', async () => {
    const user = userEvent.setup()
    const approval = pendingDune()
    mockEndpoints({ providers: true })
    mockApprovalEndpoints(approval)
    server.use(
      http.get('/v1/config', () =>
        HttpResponse.json({
          success: true,
          config: {
            tmdbRegion: 'US',
            plexSessionMonitoring: { enabled: false },
          },
        }),
      ),
    )
    const onOpenChange = vi.fn()
    renderDetail(
      itemFor(
        request({
          source: 'approval',
          id: 11,
          status: 'pending_approval',
          allInstances: [],
        }),
      ),
      onOpenChange,
    )
    await screen.findByText('Why it was held')
    const dialog = screen.getByRole('dialog')
    await user.click(
      await within(dialog).findByRole('button', { name: 'Edit routing' }),
    )
    await within(dialog).findByRole('button', { name: 'Save routing' })

    await user.click(within(dialog).getByRole('switch'))
    await user.keyboard('{Escape}')

    expect(await screen.findByText('Leave without saving?')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Stay' }))
    expect(onOpenChange).not.toHaveBeenCalled()
    expect(
      within(dialog).getByRole('button', { name: 'Save routing' }),
    ).toBeInTheDocument()

    await user.keyboard('{Escape}')
    await user.click(await screen.findByRole('button', { name: 'Leave' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('finds a ranked pending approval by content, not the capped Home list', async () => {
    const approval = pendingDune()
    mockEndpoints({ providers: true })
    mockApprovalEndpoints(approval)
    server.use(
      http.get('/v1/approval/requests', ({ request: req }) => {
        const query = new URL(req.url).searchParams
        const matches =
          query.get('search') === 'Dune' &&
          query.get('contentType') === 'movie' &&
          query.get('status') === 'pending'
        return HttpResponse.json({
          success: true,
          message: 'ok',
          approvalRequests: matches
            ? [makeApproval({ id: 3, contentTitle: 'Dune 2' }), approval]
            : [],
          total: matches ? 2 : 0,
          limit: 10,
          offset: 0,
        })
      }),
    )
    renderDetail({
      title: 'Dune',
      type: 'movie',
      guids: ['tmdb:438631'],
      thumb: null,
      watchers: ['jamie'],
    })

    expect(await screen.findByText('Why it was held')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Approve' })).toBeInTheDocument()
  })

  it('keeps the plain layout without a pending approval', async () => {
    mockEndpoints({ providers: true })
    renderDetail(itemFor(request()))

    expect(await screen.findByText('Max')).toBeInTheDocument()
    expect(sectionTitled('In Pulsarr').parentElement).toContainElement(
      screen.getByRole('heading', { name: 'About' }),
    )
    expect(screen.queryByText('Why it was held')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Approve' }),
    ).not.toBeInTheDocument()
  })

  it('says when no service carries the title in the region', async () => {
    mockEndpoints({ providers: false })
    renderDetail(itemFor(request()))

    expect(
      await screen.findByText('Not available to stream, rent or buy in US.'),
    ).toBeInTheDocument()
  })

  it('counts the watchlists a ranked title is on', async () => {
    mockEndpoints({ providers: true })
    renderDetail({
      title: 'Dune',
      type: 'movie',
      guids: ['tmdb:438631'],
      thumb: null,
      watchers: ['jamie', 'alex'],
    })

    expect(await screen.findByText('On 2 watchlists')).toBeInTheDocument()
  })

  it('says when nobody has requested or watchlisted the title', async () => {
    mockEndpoints({ providers: true })
    renderDetail({
      title: 'Dune',
      type: 'movie',
      guids: ['tmdb:438631'],
      thumb: null,
    })

    expect(
      await screen.findByText('Nobody has requested or watchlisted this yet.'),
    ).toBeInTheDocument()
  })

  it('falls back to the item hero when TMDB has no entry', async () => {
    mockEndpoints({ providers: true })
    mockMetadataError(404)
    const { container } = renderDetail(
      itemFor(
        request({
          title: 'Monster (2022)',
          contentType: 'show',
          guids: ['tvdb:389492'],
          thumb: 'https://image.tmdb.org/t/p/original/monster.jpg',
        }),
      ),
    )

    expect(await screen.findByText('No details available')).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'Monster (2022)', level: 2 }),
    ).toBeInTheDocument()
    expect(container.ownerDocument.querySelector('img')).toHaveAttribute(
      'src',
      expect.stringContaining('/monster.jpg'),
    )
    expect(screen.getByText('Sent to Radarr')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByText(/389492/)).not.toBeInTheDocument()
  })

  it('shows the error alert when metadata fails to load', async () => {
    mockEndpoints({ providers: true })
    mockMetadataError(500)
    renderDetail(itemFor(request()))

    expect(
      await screen.findByRole('alert', {}, { timeout: 3000 }),
    ).toHaveTextContent('Internal Server Error')
    expect(screen.queryByText('No details available')).not.toBeInTheDocument()
  })
})
