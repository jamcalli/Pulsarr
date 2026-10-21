import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { delay, HttpResponse, http } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import UserPage from '@/features/users/pages/user'
import { setFormatLocale } from '@/lib/format'
import { queryClient } from '@/lib/queryClient'
import { useProgressStore } from '@/stores/progressStore'
import type { components, paths } from '@/types/api.js'
import { serverError } from '../../../refetch.js'
import { server } from '../../../setup.js'
import { stubViewport } from '../../../viewport.js'

type User = components['schemas']['UserWithFriendStatus']
type QuotaStatus = components['schemas']['UserQuotaStatus']
type RecentRequest = components['schemas']['RecentRequestItem']
type UserUpdate =
  paths['/v1/users/{id}']['patch']['requestBody']['content']['application/json']
type SeparateQuotas = components['schemas']['UserQuotasUpdatePayload']
type UserTestPayload = components['schemas']['UserTestPayload']
type FriendRequestPayload =
  paths['/v1/plex/cancel-friend-request']['post']['requestBody']['content']['application/json']

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 2,
    name: 'mayar88',
    apprise: null,
    alias: 'Maya R.',
    discord_id: '331920077154',
    notify_apprise: false,
    notify_discord: true,
    notify_discord_mention: false,
    notify_plex_mobile: true,
    can_sync: true,
    requires_approval: false,
    is_primary_token: false,
    plex_uuid: 'uuid-maya',
    avatar: null,
    created_at: '2025-02-02T00:00:00Z',
    updated_at: '2026-10-09T00:00:00Z',
    friendStatus: 'friend',
    pendingSince: null,
    ...overrides,
  }
}

function quotaStatus(overrides: Partial<QuotaStatus>): QuotaStatus {
  return {
    quotaType: 'weekly_rolling',
    quotaLimit: 3,
    currentUsage: 0,
    exceeded: false,
    resetDate: null,
    bypassApproval: false,
    watchlistCap: 50,
    watchlistUsage: null,
    watchlistCapExceeded: false,
    ...overrides,
  }
}

const quotas = {
  userId: 2,
  movieQuota: {
    userId: 2,
    contentType: 'movie',
    quotaType: 'weekly_rolling',
    quotaLimit: 3,
    bypassApproval: true,
    watchlistCap: 50,
  },
  showQuota: {
    userId: 2,
    contentType: 'show',
    quotaType: 'daily',
    quotaLimit: 2,
    bypassApproval: false,
    watchlistCap: 50,
  },
} satisfies components['schemas']['UserQuotas']

const statuses = {
  movie: quotaStatus({ currentUsage: 3, exceeded: true }),
  show: quotaStatus({ quotaType: 'daily', quotaLimit: 2, currentUsage: 1 }),
}

function item(
  id: number,
  title: string,
  status: RecentRequest['status'],
  createdAt: string,
): RecentRequest {
  return {
    id,
    source: 'watchlist',
    title,
    key: `key-${id}`,
    contentType: 'movie',
    guids: [`tmdb:${id}`],
    thumb: null,
    status,
    userId: 2,
    userName: 'mayar88',
    createdAt,
    statusTimes: { requested: null, grabbed: null, notified: null },
    primaryInstance: null,
    allInstances: [],
  }
}

const items = [
  item(1, 'Dune: Part Two', 'notified', '2026-10-10T00:00:00Z'),
  item(2, 'Past Lives', 'grabbed', '2026-10-08T00:00:00Z'),
  item(3, 'Aftersun', 'pending', '2026-10-05T00:00:00Z'),
]

const stats = {
  watchlist: { pending: 1, requested: 0, grabbed: 1, notified: 1, total: 3 },
  notificationsSent: 41,
  pendingApprovals: 2,
}

function mockUser({
  user = makeUser(),
  watchlist = items,
}: {
  user?: User
  watchlist?: RecentRequest[]
} = {}) {
  const bodies = {
    patch: [] as UserUpdate[],
    deleteQuery: [] as string[],
    separate: [] as SeparateQuotas[],
    cancel: [] as FriendRequestPayload[],
    tests: [] as { userId: string; body: UserTestPayload }[],
  }
  server.use(
    http.get('/v1/config', () =>
      HttpResponse.json({ success: true, config: { tmdbRegion: 'US' } }),
    ),
    http.get('/v1/users/list', () =>
      HttpResponse.json({ success: true, message: 'ok', users: [user] }),
    ),
    http.get('/v1/users/list/with-counts', () =>
      HttpResponse.json({ success: true, message: 'ok', users: [] }),
    ),
    http.get('/v1/plex/user-status', () =>
      HttpResponse.json({ success: true, users: [], untracked: [] }),
    ),
    http.get('/v1/users/:id', () =>
      HttpResponse.json({ success: true, message: 'ok', user }),
    ),
    http.patch<never, UserUpdate>('/v1/users/:id', async ({ request }) => {
      const body = await request.json()
      bodies.patch.push(body)
      return HttpResponse.json({
        success: true,
        message: 'ok',
        user: { ...user, ...body },
      })
    }),
    http.get('/v1/users/:id/stats', () =>
      HttpResponse.json({ success: true, stats }),
    ),
    http.get('/v1/quota/users/:userId', () =>
      HttpResponse.json({ success: true, message: 'ok', userQuotas: quotas }),
    ),
    http.get('/v1/quota/users/:userId/status', ({ request }) => {
      const type = new URL(request.url).searchParams.get('contentType')
      return HttpResponse.json({
        success: true,
        message: 'ok',
        quotaStatus: type === 'show' ? statuses.show : statuses.movie,
      })
    }),
    http.get('/v1/quota/users/:userId/pending-held-count', () =>
      HttpResponse.json({
        success: true,
        message: 'ok',
        movieCount: 2,
        showCount: 0,
      }),
    ),
    http.patch<never, SeparateQuotas>(
      '/v1/quota/users/:userId/separate',
      async ({ request }) => {
        bodies.separate.push(await request.json())
        return HttpResponse.json({
          success: true,
          message: 'ok',
          userQuotas: { userId: 2 },
        })
      },
    ),
    http.delete('/v1/quota/users/:userId', ({ request }) => {
      bodies.deleteQuery.push(new URL(request.url).search)
      return HttpResponse.json({ success: true, message: 'ok' })
    }),
    http.get('/v1/users/:userId/watchlist', () =>
      HttpResponse.json({
        success: true,
        message: 'ok',
        data: {
          user: { id: user.id, name: user.name },
          items: watchlist,
          total: watchlist.length,
        },
      }),
    ),
    http.post<never, FriendRequestPayload>(
      '/v1/plex/cancel-friend-request',
      async ({ request }) => {
        bodies.cancel.push(await request.json())
        return HttpResponse.json({ success: true, message: 'ok' })
      },
    ),
    http.post<{ userId: string }, UserTestPayload>(
      '/v1/notifications/test/users/:userId',
      async ({ params, request }) => {
        bodies.tests.push({ userId: params.userId, body: await request.json() })
        return HttpResponse.json({ success: true, responseTime: 418 })
      },
    ),
    http.get('/v1/tmdb/regions', () =>
      HttpResponse.json({ success: true, message: 'ok', regions: [] }),
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
      HttpResponse.json(
        { statusCode: 404, error: 'Not Found', message: 'Not found' },
        { status: 404 },
      ),
    ),
  )
  return bodies
}

function renderPage() {
  const router = createMemoryRouter(
    [
      { path: '/users/:id', element: <UserPage /> },
      { path: '/users', element: <p>Plex users list</p> },
    ],
    { initialEntries: ['/users/2'] },
  )
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return router
}

function cardByTitle(title: string) {
  const card = screen
    .getByText(title, { selector: '[data-slot="card-title"]' })
    .closest('[data-slot="card"]')
  if (!(card instanceof HTMLElement)) throw new Error(`No card for ${title}`)
  return within(card)
}

async function findTitle() {
  return screen.findByRole('heading', { level: 1, name: 'Maya R.' })
}

describe('UserPage', () => {
  beforeEach(() => {
    setFormatLocale('en-US')
    stubViewport({ mobile: false })
    // keeps subscribers from opening the progress EventSource
    useProgressStore.setState({ isConnecting: true, systemStatusCache: {} })
  })

  afterEach(() => {
    queryClient.clear()
    setFormatLocale(undefined)
    vi.unstubAllGlobals()
  })

  it('links back to Plex users when the user is not found', async () => {
    mockUser()
    server.use(
      http.get('/v1/users/:id', () =>
        HttpResponse.json(
          { statusCode: 404, error: 'Not Found', message: 'User not found' },
          { status: 404 },
        ),
      ),
    )
    renderPage()

    expect(
      await screen.findByRole('link', { name: 'Plex users' }),
    ).toHaveAttribute('href', '/users')
  })

  it('asks for a missing user once without retrying the 404', async () => {
    mockUser()
    let calls = 0
    server.use(
      http.get('/v1/users/:id', () => {
        calls += 1
        return HttpResponse.json(
          { statusCode: 404, error: 'Not Found', message: 'User not found' },
          { status: 404 },
        )
      }),
    )
    renderPage()

    expect(
      await screen.findByRole('link', { name: 'Plex users' }),
    ).toBeInTheDocument()
    expect(calls).toBe(1)
  })

  it('names the user by alias with the username under it', async () => {
    mockUser()
    renderPage()

    const title = await findTitle()
    expect(title.parentElement).toHaveTextContent('mayar88')
    expect(screen.getByText('Friend')).toBeInTheDocument()
  })

  it('shows six stat tiles with one quota at its limit', async () => {
    mockUser()
    renderPage()
    await findTitle()

    const tiles = document.querySelectorAll('[data-slot="stat-tile"]')
    expect(tiles).toHaveLength(6)
    const row = tiles[0]?.parentElement
    if (!row) throw new Error('stat tiles are not in a row')
    expect(within(row).getAllByText('At limit')).toHaveLength(1)
    expect(within(row).getByText('3 of 3')).toBeInTheDocument()
    expect(
      within(row).getByRole('link', { name: 'Pending approvals' }),
    ).toHaveAttribute('href', '/requests?user=2')
  })

  it('shows each quota card with its usage, and Remove quotas after the Shows card', async () => {
    mockUser()
    renderPage()
    await findTitle()

    const movies = cardByTitle('Movies')
    expect(
      movies.getByText('Used 3 of 3 in the current period'),
    ).toBeInTheDocument()
    expect(movies.getByText('At limit')).toBeInTheDocument()
    const shows = cardByTitle('Shows')
    expect(shows.getByText('Used 1 of 2 today')).toBeInTheDocument()
    expect(shows.queryByText('At limit')).not.toBeInTheDocument()
    expect(screen.queryByText('Used')).not.toBeInTheDocument()

    const showsCard = screen
      .getByText('Shows', { selector: '[data-slot="card-title"]' })
      .closest('[data-slot="card"]')
    expect(showsCard?.nextElementSibling).toContainElement(
      screen.getByRole('button', { name: 'Remove quotas' }),
    )
  })

  it('reads a quota with nothing counted yet as none used', async () => {
    mockUser()
    server.use(
      http.get('/v1/quota/users/:userId/status', ({ request }) => {
        const type = new URL(request.url).searchParams.get('contentType')
        const status = type === 'show' ? statuses.show : statuses.movie
        return HttpResponse.json({
          success: true,
          message: 'ok',
          quotaStatus: { ...status, currentUsage: 0, exceeded: false },
        })
      }),
    )
    renderPage()
    await findTitle()

    expect(
      await cardByTitle('Movies').findByText('None used in the current period'),
    ).toBeInTheDocument()
    expect(
      cardByTitle('Shows').getByText('None used today'),
    ).toBeInTheDocument()
  })

  it('saves only the changed alias', async () => {
    const user = userEvent.setup()
    const bodies = mockUser()
    renderPage()
    await findTitle()

    expect(
      screen.queryByRole('button', { name: 'Save changes' }),
    ).not.toBeInTheDocument()
    const alias = screen.getByRole('textbox', { name: 'Alias' })
    await user.clear(alias)
    await user.type(alias, 'Maya Rivera')
    const save = screen.getByRole('button', { name: 'Save changes' })
    expect(save).toBeEnabled()
    await user.click(save)

    await waitFor(() =>
      expect(bodies.patch).toEqual([{ alias: 'Maya Rivera' }]),
    )
  })

  it('writes no quotas when the settings save fails', async () => {
    const user = userEvent.setup()
    const bodies = mockUser()
    server.use(
      http.patch('/v1/users/:id', () =>
        HttpResponse.json(
          {
            statusCode: 400,
            error: 'Bad Request',
            message: 'Settings were rejected',
          },
          { status: 400 },
        ),
      ),
    )
    renderPage()
    await findTitle()

    const alias = screen.getByRole('textbox', { name: 'Alias' })
    await user.clear(alias)
    await user.type(alias, 'Maya Rivera')
    const limit = cardByTitle('Movies').getByLabelText('Requests per period')
    await user.clear(limit)
    await user.type(limit, '6')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(
      await screen.findByText('Settings were rejected'),
    ).toBeInTheDocument()
    expect(bodies.separate).toEqual([])
    expect(bodies.deleteQuery).toEqual([])
  })

  it('turns on a Discord mention while Discord messages are off', async () => {
    const user = userEvent.setup()
    const bodies = mockUser({ user: makeUser({ notify_discord: false }) })
    renderPage()
    await findTitle()

    const mention = screen.getByRole('switch', { name: 'Discord mention' })
    expect(mention).not.toHaveAttribute('aria-disabled', 'true')
    await user.click(mention)
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() =>
      expect(bodies.patch).toEqual([{ notify_discord_mention: true }]),
    )
  })

  it('locks a Discord mention without a Discord id', async () => {
    mockUser({ user: makeUser({ discord_id: null }) })
    renderPage()
    await findTitle()

    expect(
      screen.getByRole('switch', { name: 'Discord mention' }),
    ).toHaveAttribute('aria-disabled', 'true')
  })

  it('asks to approve the held requests when removing quotas', async () => {
    const user = userEvent.setup()
    const bodies = mockUser()
    renderPage()
    await findTitle()

    await user.click(screen.getByRole('button', { name: 'Remove quotas' }))
    const dialog = await screen.findByRole('dialog', {
      name: 'Remove quotas for Maya R.?',
    })
    await user.click(await within(dialog).findByRole('switch'))
    await user.click(
      within(dialog).getByRole('button', { name: 'Remove quotas' }),
    )

    await waitFor(() =>
      expect(bodies.deleteQuery).toEqual(['?autoApproveHeld=true']),
    )
  })

  it('shows the held count error and locks approving held requests', async () => {
    const user = userEvent.setup()
    mockUser()
    server.use(
      http.get('/v1/quota/users/:userId/pending-held-count', serverError),
    )
    renderPage()
    await findTitle()

    await user.click(screen.getByRole('button', { name: 'Remove quotas' }))
    const dialog = await screen.findByRole('dialog', {
      name: 'Remove quotas for Maya R.?',
    })

    expect(await within(dialog).findByText('Down')).toBeInTheDocument()
    expect(within(dialog).getByRole('switch')).toHaveAttribute(
      'aria-disabled',
      'true',
    )

    server.use(
      http.get('/v1/quota/users/:userId/pending-held-count', () =>
        HttpResponse.json({
          success: true,
          message: 'ok',
          movieCount: 2,
          showCount: 1,
        }),
      ),
    )
    await user.click(within(dialog).getByRole('button', { name: 'Retry' }))

    await waitFor(() =>
      expect(within(dialog).getByRole('switch')).not.toHaveAttribute(
        'aria-disabled',
        'true',
      ),
    )
    expect(within(dialog).queryByText('Down')).not.toBeInTheDocument()
  })

  it('removes a friend and returns to Plex users', async () => {
    const user = userEvent.setup()
    const bodies = mockUser()
    const router = renderPage()
    await findTitle()

    await user.click(screen.getByRole('button', { name: 'Remove friend' }))
    const dialog = await screen.findByRole('dialog', {
      name: 'Remove Maya R. as a friend?',
    })
    await user.click(
      within(dialog).getByRole('button', { name: 'Remove friend' }),
    )

    await waitFor(() => expect(router.state.location.pathname).toBe('/users'))
    expect(bodies.cancel).toEqual([{ uuid: 'uuid-maya' }])
  })

  it('narrows the watchlist by status', async () => {
    const user = userEvent.setup()
    mockUser()
    renderPage()
    await findTitle()

    expect(screen.getByText('Dune: Part Two')).toBeInTheDocument()
    expect(screen.getByText('Aftersun')).toBeInTheDocument()
    await user.click(
      within(screen.getByRole('group', { name: 'Status' })).getByText(
        'Grabbed',
      ),
    )

    await waitFor(() =>
      expect(screen.queryByText('Dune: Part Two')).not.toBeInTheDocument(),
    )
    expect(screen.getByText('Past Lives')).toBeInTheDocument()
    expect(screen.queryByText('Aftersun')).not.toBeInTheDocument()
  })

  it('opens the media detail from a watchlist row', async () => {
    const user = userEvent.setup()
    mockUser()
    renderPage()
    await findTitle()

    await user.click(screen.getByRole('button', { name: /Past Lives/ }))

    expect(await screen.findByRole('dialog')).toBeInTheDocument()
  })

  it('reads an empty quotas answer as no quotas and creates only the type switched on', async () => {
    const user = userEvent.setup()
    const bodies = mockUser()
    const statusCalls: string[] = []
    server.use(
      http.get('/v1/quota/users/:userId', () =>
        HttpResponse.json({
          success: true,
          message: 'ok',
          userQuotas: { userId: 2 },
        }),
      ),
      http.get('/v1/quota/users/:userId/status', ({ request }) => {
        statusCalls.push(request.url)
        return HttpResponse.json({
          success: true,
          message: 'ok',
          quotaStatus: null,
        })
      }),
    )
    renderPage()
    await findTitle()

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByText('No quotas')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Remove quotas' }),
    ).not.toBeInTheDocument()
    expect(statusCalls).toEqual([])
    expect(screen.queryByText(/^Used /)).not.toBeInTheDocument()
    expect(screen.queryByText(/^None used /)).not.toBeInTheDocument()
    const movies = cardByTitle('Movies')
    const shows = cardByTitle('Shows')
    expect(
      movies.getByRole('switch', { name: 'Limit requests' }),
    ).not.toBeChecked()
    expect(movies.queryByLabelText('Quota period')).toBeNull()
    expect(movies.queryByLabelText('Requests per period')).toBeNull()
    expect(
      movies.queryByRole('switch', { name: 'Cap the watchlist' }),
    ).toBeNull()
    expect(
      shows.getByRole('switch', { name: 'Limit requests' }),
    ).not.toBeChecked()
    expect(shows.queryByLabelText('Requests per period')).toBeNull()

    await user.click(movies.getByRole('switch', { name: 'Limit requests' }))
    const limit = movies.getByLabelText('Requests per period')
    expect(limit).toBeEnabled()
    expect(movies.getByLabelText('Quota period')).toBeEnabled()
    await user.clear(limit)
    await user.type(limit, '4')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() =>
      expect(bodies.separate).toEqual([
        {
          movieQuota: {
            enabled: true,
            quotaType: 'monthly',
            quotaLimit: 4,
            bypassApproval: false,
            watchlistCap: null,
          },
          showQuota: { enabled: false },
        },
      ]),
    )
  })

  it('blocks a save while a switched on type has no limit and deletes a type switched off', async () => {
    const user = userEvent.setup()
    const bodies = mockUser()
    renderPage()
    await findTitle()

    const movies = cardByTitle('Movies')
    const shows = cardByTitle('Shows')
    expect(movies.getByRole('switch', { name: 'Limit requests' })).toBeChecked()
    expect(movies.getByLabelText('Requests per period')).toHaveValue('3')
    expect(
      movies.getByRole('switch', { name: 'Cap the watchlist' }),
    ).toBeChecked()
    expect(movies.getByLabelText('Watchlist cap')).toHaveValue('50')

    const limit = movies.getByLabelText('Requests per period')
    await user.clear(limit)
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled()

    await user.type(limit, '6')
    expect(
      movies.getByRole('switch', { name: 'Cap the watchlist' }),
    ).toHaveAttribute('aria-disabled', 'true')
    await user.click(shows.getByRole('switch', { name: 'Limit requests' }))
    expect(shows.queryByLabelText('Requests per period')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() =>
      expect(bodies.separate).toEqual([
        {
          movieQuota: {
            enabled: true,
            quotaType: 'weekly_rolling',
            quotaLimit: 6,
            bypassApproval: true,
            watchlistCap: 50,
          },
          showQuota: { enabled: false },
        },
      ]),
    )
  })

  it('offers Remove friend for a friend without a shared server', async () => {
    mockUser({ user: makeUser({ friendStatus: 'friend_only' }) })
    renderPage()
    await findTitle()

    expect(
      screen.getByRole('button', { name: 'Remove friend' }),
    ).toBeInTheDocument()
  })

  it('shows the same empty watchlist state for a user without a shared server', async () => {
    mockUser({
      user: makeUser({ friendStatus: 'friend_only' }),
      watchlist: [],
    })
    renderPage()
    await findTitle()

    const watchlist = cardByTitle('Watchlist')
    expect(watchlist.queryByRole('searchbox')).not.toBeInTheDocument()
    expect(watchlist.queryByRole('group')).not.toBeInTheDocument()
    expect(watchlist.queryByRole('button')).not.toBeInTheDocument()
  })

  it('keeps the skeleton up while the watchlist is still loading', async () => {
    const served: string[] = []
    mockUser()
    server.use(
      http.get('/v1/users/:userId/watchlist', () => delay('infinite')),
      http.get('/v1/users/:id/stats', () => {
        served.push('stats')
        return HttpResponse.json({ success: true, stats })
      }),
    )
    renderPage()

    await waitFor(() => expect(served).toEqual(['stats']))
    expect(document.querySelector('[aria-busy="true"]')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument()
  })

  it('locks Remove friend and Remove quotas while a change is unsaved', async () => {
    const user = userEvent.setup()
    mockUser()
    renderPage()
    await findTitle()

    const removeFriend = screen.getByRole('button', { name: 'Remove friend' })
    const removeQuotas = screen.getByRole('button', { name: 'Remove quotas' })
    expect(removeFriend).toBeEnabled()
    expect(removeQuotas).toBeEnabled()
    await user.type(screen.getByRole('textbox', { name: 'Alias' }), 'x')

    expect(removeFriend).toBeDisabled()
    expect(removeQuotas).toBeDisabled()
  })

  it('blocks a save on a blank cap until bypass is on', async () => {
    const user = userEvent.setup()
    const bodies = mockUser()
    renderPage()
    await findTitle()

    const shows = cardByTitle('Shows')
    await user.clear(shows.getByLabelText('Watchlist cap'))
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled()

    await user.click(
      shows.getByRole('switch', { name: 'Bypass approval over the limit' }),
    )
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() =>
      expect(bodies.separate).toEqual([
        {
          movieQuota: {
            enabled: true,
            quotaType: 'weekly_rolling',
            quotaLimit: 3,
            bypassApproval: true,
            watchlistCap: 50,
          },
          showQuota: {
            enabled: true,
            quotaType: 'daily',
            quotaLimit: 2,
            bypassApproval: true,
            watchlistCap: null,
          },
        },
      ]),
    )
  })

  it('sends a Discord DM test to the saved user', async () => {
    const user = userEvent.setup()
    const bodies = mockUser()
    renderPage()
    await findTitle()

    await user.click(screen.getByRole('button', { name: 'Discord DM' }))

    expect(await screen.findByText('in 418 ms')).toBeInTheDocument()
    expect(bodies.tests).toEqual([
      { userId: '2', body: { channel: 'discord-dm' } },
    ])
  })

  it('locks the Apprise test without a saved Apprise URL', async () => {
    mockUser()
    renderPage()
    await findTitle()

    expect(screen.getByRole('button', { name: 'Apprise' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Discord DM' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Plex mobile' })).toBeEnabled()
  })

  it('locks every test while a change is unsaved', async () => {
    const user = userEvent.setup()
    mockUser({ user: makeUser({ apprise: 'mailto://maya@example.com' }) })
    renderPage()
    await findTitle()

    expect(screen.getByRole('button', { name: 'Apprise' })).toBeEnabled()
    await user.type(screen.getByRole('textbox', { name: 'Alias' }), 'x')

    for (const name of ['Discord DM', 'Apprise', 'Plex mobile']) {
      expect(screen.getByRole('button', { name })).toBeDisabled()
    }
    expect(screen.getByText('Send a test').parentElement).toHaveTextContent(
      'Save or discard your changes first.',
    )
  })
})
