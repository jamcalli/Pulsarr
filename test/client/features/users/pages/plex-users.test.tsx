import { QUOTA_DEFAULTS } from '@root/schemas/shared/quota-limits'
import { QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { delay, HttpResponse, http } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { invalidatePlexUsers } from '@/features/users/lib/users-queries'
import PlexUsersPage from '@/features/users/pages/plex-users'
import { setFormatLocale } from '@/lib/format'
import { usersKeys } from '@/lib/query-keys'
import { queryClient } from '@/lib/queryClient'
import { useProgressStore } from '@/stores/progressStore'
import type { components, paths } from '@/types/api.js'
import { server } from '../../../setup.js'
import { stubViewport } from '../../../viewport.js'

type PlexUser = components['schemas']['UserWithCount']
type QuotaStatus = components['schemas']['UserQuotaStatus']
type BulkUsersPayload =
  paths['/v1/users/bulk']['patch']['requestBody']['content']['application/json']
type BulkQuotaPayload = components['schemas']['UserQuotaBulkOperationPayload']
type FriendRequestPayload =
  paths['/v1/plex/send-friend-request']['post']['requestBody']['content']['application/json']

function plexUser(
  overrides: Partial<PlexUser> & Pick<PlexUser, 'id' | 'name'>,
) {
  return {
    apprise: null,
    alias: null,
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
    friendStatus: 'friend',
    pendingSince: null,
    watchlist_count: 0,
    ...overrides,
  } satisfies PlexUser
}

const users: PlexUser[] = [
  plexUser({
    id: 1,
    name: 'lukas.admin',
    alias: 'Lukas',
    friendStatus: 'self',
    is_primary_token: true,
    notify_plex_mobile: true,
    watchlist_count: 16,
  }),
  plexUser({
    id: 2,
    name: 'mayar88',
    alias: 'Maya R.',
    discord_id: '331920077154',
    notify_discord: true,
    watchlist_count: 23,
  }),
  plexUser({
    id: 3,
    name: 'theo_watches',
    requires_approval: true,
    watchlist_count: 17,
  }),
  plexUser({
    id: 4,
    name: 'dana.m',
    alias: 'Dana',
    friendStatus: 'friend_only',
  }),
]

function quotaStatus(overrides: Partial<QuotaStatus>): QuotaStatus {
  return {
    quotaType: 'weekly_rolling',
    quotaLimit: 3,
    currentUsage: 0,
    exceeded: false,
    resetDate: null,
    bypassApproval: false,
    watchlistCap: null,
    watchlistUsage: null,
    watchlistCapExceeded: false,
    ...overrides,
  }
}

const quotaStatuses = {
  movie: [
    {
      userId: 2,
      quotaStatus: quotaStatus({ currentUsage: 3, exceeded: true }),
    },
  ],
  show: [
    {
      userId: 2,
      quotaStatus: quotaStatus({
        quotaType: 'daily',
        quotaLimit: 2,
        currentUsage: 1,
      }),
    },
  ],
}

const untracked = [
  {
    uuid: 'uuid-sam',
    username: 'sam_holt',
    avatar: '',
    status: 'pending_sent',
    pendingSince: '2026-01-01T00:00:00Z',
  },
  {
    uuid: 'uuid-couch',
    username: 'couchpotato',
    avatar: '',
    status: 'server_only',
    pendingSince: null,
  },
  {
    uuid: 'uuid-kid',
    username: 'kid_account',
    avatar: '',
    status: 'managed',
    pendingSince: null,
  },
]

function manyUsers(count: number) {
  return Array.from({ length: count }, (_, index) =>
    plexUser({ id: index + 1, name: `user${index + 1}` }),
  )
}

function mockUsers({
  plexTokens = ['token'],
  failedIds = [],
  list = users,
}: {
  plexTokens?: string[]
  failedIds?: number[]
  list?: PlexUser[]
} = {}) {
  const bodies = {
    bulk: [] as BulkUsersPayload[],
    quotas: [] as BulkQuotaPayload[],
    send: [] as FriendRequestPayload[],
  }
  server.use(
    http.get('/v1/config', () =>
      HttpResponse.json({ success: true, config: { plexTokens } }),
    ),
    http.get('/v1/users/list/with-counts', () =>
      HttpResponse.json({ success: true, message: 'ok', users: list }),
    ),
    http.post<never, { contentType: 'movie' | 'show' }>(
      '/v1/quota/users/status/bulk',
      async ({ request }) => {
        const { contentType } = await request.json()
        return HttpResponse.json({
          success: true,
          message: 'ok',
          quotaStatuses: quotaStatuses[contentType],
        })
      },
    ),
    http.get('/v1/plex/user-status', () =>
      HttpResponse.json({ success: true, users: [], untracked }),
    ),
    http.patch<never, BulkUsersPayload>(
      '/v1/users/bulk',
      async ({ request }) => {
        const body = await request.json()
        bodies.bulk.push(body)
        return HttpResponse.json({
          success: true,
          message: 'ok',
          updatedCount: body.userIds.length - failedIds.length,
          failedIds,
        })
      },
    ),
    http.patch<never, BulkQuotaPayload>(
      '/v1/quota/users/bulk',
      async ({ request }) => {
        const body = await request.json()
        bodies.quotas.push(body)
        return HttpResponse.json({
          success: true,
          message: 'ok',
          processedCount: body.userIds.length,
        })
      },
    ),
    http.post<never, FriendRequestPayload>(
      '/v1/plex/send-friend-request',
      async ({ request }) => {
        bodies.send.push(await request.json())
        return HttpResponse.json({ success: true, message: 'ok' })
      },
    ),
  )
  return bodies
}

function renderPage(initialEntry = '/') {
  const router = createMemoryRouter(
    [{ path: '*', element: <PlexUsersPage /> }],
    { initialEntries: [initialEntry] },
  )
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return router
}

async function findTable() {
  return screen.findByRole('table', { name: 'Plex users' })
}

function bodyRows(table: HTMLElement) {
  return within(table).getAllByRole('row').slice(1)
}

function rowNames(table: HTMLElement) {
  return bodyRows(table).map((row) => within(row).getByRole('link').textContent)
}

function fieldSection(container: HTMLElement, title: string) {
  return within(within(container).getByRole('group', { name: title }))
}

function selectionBar() {
  return screen.getByRole('region', { name: 'Selection' })
}

describe('PlexUsersPage', () => {
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

  it('lists every tracked user with a link to their page', async () => {
    mockUsers()
    renderPage()

    const table = await findTable()
    expect(bodyRows(table)).toHaveLength(4)
    expect(
      within(table).getByRole('link', { name: 'Maya R.' }),
    ).toHaveAttribute('href', '/users/2')
    expect(within(table).getByText('mayar88')).toBeInTheDocument()
    expect(within(table).getByText('At limit')).toBeInTheDocument()
    expect(within(table).getByText('No server')).toBeInTheDocument()
  })

  it('narrows the rows by relationship', async () => {
    const user = userEvent.setup()
    mockUsers()
    renderPage()
    const table = await findTable()

    await user.click(screen.getByRole('combobox', { name: 'Relationship' }))
    await user.click(await screen.findByRole('option', { name: 'No server' }))

    await waitFor(() => expect(bodyRows(table)).toHaveLength(1))
    expect(
      within(table).getByRole('link', { name: 'Dana' }),
    ).toBeInTheDocument()
  })

  it('clears the relationship filter from the All item under the heading', async () => {
    const user = userEvent.setup()
    mockUsers()
    renderPage()
    const table = await findTable()
    const trigger = screen.getByRole('combobox', { name: 'Relationship' })

    await user.click(trigger)
    await user.click(await screen.findByRole('option', { name: 'No server' }))
    await waitFor(() => expect(bodyRows(table)).toHaveLength(1))
    expect(trigger).toHaveTextContent('No server')

    await user.click(trigger)
    expect(
      await screen.findByRole('group', { name: 'Relationship' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('option', { name: 'Relationship' }),
    ).not.toBeInTheDocument()
    await user.click(screen.getByRole('option', { name: 'All' }))

    await waitFor(() => expect(bodyRows(table)).toHaveLength(4))
    expect(trigger).toHaveTextContent('Relationship')
  })

  it('moves the filters into a drawer with no sort select on a phone', async () => {
    const user = userEvent.setup()
    stubViewport({ mobile: true })
    mockUsers()
    renderPage()
    await findTable()

    await user.click(screen.getByRole('button', { name: /^Filters/ }))
    const drawer = await screen.findByRole('dialog', { name: 'Filters' })
    expect(within(drawer).getByLabelText('Relationship')).toBeInTheDocument()
    expect(within(drawer).queryByLabelText('Sort by')).not.toBeInTheDocument()
  })

  it('matches the Plex username behind an alias', async () => {
    const user = userEvent.setup()
    mockUsers()
    renderPage()
    const table = await findTable()

    await user.type(
      screen.getByRole('searchbox', { name: 'Search users' }),
      'mayar',
    )

    await waitFor(() => expect(bodyRows(table)).toHaveLength(1))
    expect(
      within(table).getByRole('link', { name: 'Maya R.' }),
    ).toBeInTheDocument()
  })

  it('sends only the changed settings in bulk', async () => {
    const user = userEvent.setup()
    const bodies = mockUsers()
    renderPage()
    await findTable()

    await user.click(screen.getByRole('checkbox', { name: 'Select Maya R.' }))
    await user.click(
      screen.getByRole('checkbox', { name: 'Select theo_watches' }),
    )
    expect(within(selectionBar()).getByText('2 selected')).toBeInTheDocument()

    await user.click(
      within(selectionBar()).getByRole('button', { name: 'Edit settings' }),
    )
    const dialog = await screen.findByRole('dialog', {
      name: 'Edit settings for 2 users',
    })
    await user.click(
      within(
        within(dialog).getByRole('group', { name: 'Require approval' }),
      ).getByRole('button', { name: 'On' }),
    )
    await user.click(
      within(dialog).getByRole('switch', { name: 'Clear Discord user ID' }),
    )
    await user.click(
      within(dialog).getByRole('button', { name: 'Apply to 2 users' }),
    )

    await waitFor(() =>
      expect(bodies.bulk).toEqual([
        {
          userIds: [2, 3],
          updates: {
            requires_approval: true,
            discord_id: null,
            notify_discord: false,
          },
        },
      ]),
    )
    await waitFor(() =>
      expect(
        screen.queryByRole('region', { name: 'Selection' }),
      ).not.toBeInTheDocument(),
    )
  })

  it('sets each type in bulk, deleting the type switched off', async () => {
    const user = userEvent.setup()
    const bodies = mockUsers()
    renderPage()
    await findTable()

    await user.click(screen.getByRole('checkbox', { name: 'Select Maya R.' }))
    await user.click(
      screen.getByRole('checkbox', { name: 'Select theo_watches' }),
    )
    await user.click(
      within(selectionBar()).getByRole('button', { name: 'Edit quotas' }),
    )
    const dialog = await screen.findByRole('dialog', {
      name: 'Edit quotas for 2 users',
    })
    const movies = fieldSection(dialog, 'Movies')
    const shows = fieldSection(dialog, 'Shows')
    expect(movies.getByRole('switch', { name: 'Limit requests' })).toBeChecked()
    expect(shows.getByRole('switch', { name: 'Limit requests' })).toBeChecked()

    const limit = movies.getByLabelText('Requests per period')
    await user.clear(limit)
    expect(
      within(dialog).getByRole('button', { name: 'Apply to 2 users' }),
    ).toBeDisabled()
    await user.type(limit, '7')
    await user.click(movies.getByRole('switch', { name: 'Cap the watchlist' }))
    const cap = movies.getByLabelText('Watchlist cap')
    await user.clear(cap)
    await user.type(cap, '30')
    await user.click(shows.getByRole('switch', { name: 'Limit requests' }))
    expect(shows.getByLabelText('Requests per period')).toBeDisabled()
    await user.click(
      within(dialog).getByRole('button', { name: 'Apply to 2 users' }),
    )

    await waitFor(() =>
      expect(bodies.quotas).toEqual([
        {
          userIds: [2, 3],
          operation: 'update',
          movieQuota: {
            enabled: true,
            quotaType: 'monthly',
            quotaLimit: 7,
            bypassApproval: false,
            watchlistCap: 30,
          },
          showQuota: { enabled: false },
        },
      ]),
    )
  })

  it('asks before closing the bulk settings with changes', async () => {
    const user = userEvent.setup()
    mockUsers()
    renderPage()
    await findTable()
    await user.click(screen.getByRole('checkbox', { name: 'Select Maya R.' }))
    const open = async () => {
      await user.click(
        within(selectionBar()).getByRole('button', { name: 'Edit settings' }),
      )
      return screen.findByRole('dialog', { name: 'Edit settings for 1 user' })
    }

    await user.click(
      within(await open()).getByRole('button', { name: 'Cancel' }),
    )
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Edit settings for 1 user' }),
      ).toBeNull(),
    )
    expect(
      screen.queryByRole('dialog', { name: 'Leave without saving?' }),
    ).toBeNull()

    const dialog = await open()
    await user.click(
      within(dialog).getByRole('switch', { name: 'Clear Discord user ID' }),
    )
    await user.keyboard('{Escape}')

    expect(
      await screen.findByRole('dialog', { name: 'Leave without saving?' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('dialog', {
        name: 'Edit settings for 1 user',
        hidden: true,
      }),
    ).toBeInTheDocument()
  })

  it('asks before closing the bulk quotas with changes', async () => {
    const user = userEvent.setup()
    mockUsers()
    renderPage()
    await findTable()
    await user.click(screen.getByRole('checkbox', { name: 'Select Maya R.' }))
    const open = async () => {
      await user.click(
        within(selectionBar()).getByRole('button', { name: 'Edit quotas' }),
      )
      return screen.findByRole('dialog', { name: 'Edit quotas for 1 user' })
    }

    await user.click(
      within(await open()).getByRole('button', { name: 'Cancel' }),
    )
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Edit quotas for 1 user' }),
      ).toBeNull(),
    )
    expect(
      screen.queryByRole('dialog', { name: 'Leave without saving?' }),
    ).toBeNull()

    const dialog = await open()
    await user.click(
      fieldSection(dialog, 'Shows').getByRole('switch', {
        name: 'Limit requests',
      }),
    )
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))

    expect(
      await screen.findByRole('dialog', { name: 'Leave without saving?' }),
    ).toBeInTheDocument()
  })

  it('keeps the users that failed selected and shows the alert', async () => {
    const user = userEvent.setup()
    mockUsers({ failedIds: [3] })
    renderPage()
    await findTable()

    await user.click(screen.getByRole('checkbox', { name: 'Select Maya R.' }))
    await user.click(
      screen.getByRole('checkbox', { name: 'Select theo_watches' }),
    )
    await user.click(
      within(selectionBar()).getByRole('button', { name: 'Edit settings' }),
    )
    const dialog = await screen.findByRole('dialog', {
      name: 'Edit settings for 2 users',
    })
    await user.click(
      within(dialog).getByRole('switch', { name: 'Clear alias' }),
    )
    await user.click(
      within(dialog).getByRole('button', { name: 'Apply to 2 users' }),
    )

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('theo_watches')
    expect(within(selectionBar()).getByText('1 selected')).toBeInTheDocument()
    expect(
      screen.getByRole('checkbox', { name: 'Select theo_watches' }),
    ).toHaveAttribute('aria-checked', 'true')
    expect(
      screen.getByRole('checkbox', { name: 'Select Maya R.' }),
    ).toHaveAttribute('aria-checked', 'false')
  })

  it('lists accounts that are not friends yet and sends a request', async () => {
    const user = userEvent.setup()
    const bodies = mockUsers()
    renderPage()
    await findTable()

    const card = screen.getByRole('list', { name: 'Not yet friends' })
    expect(within(card).getAllByRole('listitem')).toHaveLength(2)
    expect(within(card).queryByText('kid_account')).not.toBeInTheDocument()

    await user.click(
      within(card).getByRole('button', { name: 'Send friend request' }),
    )

    await waitFor(() => expect(bodies.send).toEqual([{ uuid: 'uuid-couch' }]))
  })

  it('hides the toolbar when Plex is not connected', async () => {
    mockUsers({ plexTokens: [] })
    renderPage()

    expect(
      await screen.findByRole('link', { name: 'Open Plex connection' }),
    ).toHaveAttribute('href', '/system/plex')
    expect(
      screen.queryByRole('searchbox', { name: 'Search users' }),
    ).not.toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('keeps the skeleton up while the Plex statuses are still loading', async () => {
    const served: string[] = []
    mockUsers()
    server.use(
      http.get('/v1/plex/user-status', () => delay('infinite')),
      http.get('/v1/users/list/with-counts', () => {
        served.push('users')
        return HttpResponse.json({ success: true, message: 'ok', users })
      }),
    )
    renderPage()

    await waitFor(() => expect(served).toEqual(['users']))
    expect(document.querySelector('[aria-busy="true"]')).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: 'Plex users' }),
    ).not.toBeInTheDocument()
  })

  it('blocks a bulk save on a blank cap until bypass is on', async () => {
    const user = userEvent.setup()
    const bodies = mockUsers()
    renderPage()
    await findTable()

    await user.click(screen.getByRole('checkbox', { name: 'Select Maya R.' }))
    await user.click(
      within(selectionBar()).getByRole('button', { name: 'Edit quotas' }),
    )
    const dialog = await screen.findByRole('dialog', {
      name: 'Edit quotas for 1 user',
    })
    const movies = fieldSection(dialog, 'Movies')
    const apply = within(dialog).getByRole('button', {
      name: 'Apply to 1 user',
    })
    await user.click(movies.getByRole('switch', { name: 'Cap the watchlist' }))
    await user.clear(movies.getByLabelText('Watchlist cap'))
    expect(apply).toBeDisabled()

    await user.click(
      movies.getByRole('switch', { name: 'Bypass approval over the limit' }),
    )
    expect(apply).toBeEnabled()
    await user.click(apply)

    await waitFor(() => expect(bodies.quotas).toHaveLength(1))
    expect(bodies.quotas[0]?.movieQuota).toEqual({
      enabled: true,
      quotaType: 'monthly',
      quotaLimit: QUOTA_DEFAULTS.limit,
      bypassApproval: true,
      watchlistCap: null,
    })
  })

  it('pages by the picked size and remembers it', async () => {
    const user = userEvent.setup()
    mockUsers({ list: manyUsers(25) })
    const router = renderPage('/?page=2')
    const table = await findTable()
    expect(bodyRows(table)).toHaveLength(5)

    await user.click(screen.getByRole('combobox', { name: 'Rows per page' }))
    await user.click(await screen.findByRole('option', { name: '10 per page' }))

    await waitFor(() => expect(bodyRows(table)).toHaveLength(10))
    expect(router.state.location.search).toBe('')
    expect(screen.getByText('1 to 10 of 25')).toBeInTheDocument()
    expect(localStorage.getItem('pulsarr-table-users-pageSize')).toBe('10')
  })

  it('opens with the saved page size', async () => {
    localStorage.setItem('pulsarr-table-users-pageSize', '30')
    mockUsers({ list: manyUsers(35) })
    renderPage()

    const table = await findTable()
    expect(bodyRows(table)).toHaveLength(30)
    expect(
      screen.getByRole('combobox', { name: 'Rows per page' }),
    ).toHaveTextContent('30 per page')
  })

  it.each([
    ['User', 'user'],
    ['Relationship', 'relationship'],
    ['Watchlist', 'watchlist'],
    ['Sync', 'sync'],
    ['Approval', 'approval'],
    ['Notifications', 'notifications'],
    ['Quotas', 'quotas'],
  ])('sorts by the %s header', async (header, key) => {
    const user = userEvent.setup()
    mockUsers()
    const router = renderPage()
    const table = await findTable()

    await user.click(within(table).getByRole('button', { name: header }))

    await waitFor(() =>
      expect(
        new URLSearchParams(router.state.location.search).get('sort'),
      ).toBe(key),
    )
    expect(
      within(table).getByRole('columnheader', { name: header }),
    ).toHaveAttribute('aria-sort')
  })

  it('orders rows by relationship, owner first', async () => {
    const user = userEvent.setup()
    mockUsers()
    renderPage()
    const table = await findTable()

    await user.click(
      within(table).getByRole('button', { name: 'Relationship' }),
    )

    await waitFor(() =>
      expect(rowNames(table)).toEqual([
        'Lukas',
        'Maya R.',
        'theo_watches',
        'Dana',
      ]),
    )
  })

  it('clears the selection when the page size changes', async () => {
    const user = userEvent.setup()
    mockUsers({ list: manyUsers(25) })
    renderPage()
    await findTable()

    await user.click(screen.getByRole('checkbox', { name: 'Select user1' }))
    expect(within(selectionBar()).getByText('1 selected')).toBeInTheDocument()

    await user.click(screen.getByRole('combobox', { name: 'Rows per page' }))
    await user.click(await screen.findByRole('option', { name: '10 per page' }))

    await waitFor(() =>
      expect(
        screen.queryByRole('region', { name: 'Selection' }),
      ).not.toBeInTheDocument(),
    )
  })

  it('drops a selected user that a refetch moves out of the filter', async () => {
    const user = userEvent.setup()
    mockUsers()
    renderPage('/?sync=on')
    await findTable()

    await user.click(screen.getByRole('checkbox', { name: 'Select Maya R.' }))
    await user.click(
      screen.getByRole('checkbox', { name: 'Select theo_watches' }),
    )
    expect(within(selectionBar()).getByText('2 selected')).toBeInTheDocument()

    server.use(
      http.get('/v1/users/list/with-counts', () =>
        HttpResponse.json({
          success: true,
          message: 'ok',
          users: users.map((entry) =>
            entry.id === 2 ? { ...entry, can_sync: false } : entry,
          ),
        }),
      ),
    )
    await invalidatePlexUsers()

    await waitFor(() =>
      expect(
        within(selectionBar()).getByText('1 selected'),
      ).toBeInTheDocument(),
    )
  })

  it('keeps the table when a background refetch fails', async () => {
    mockUsers()
    renderPage()
    const table = await findTable()
    let failedLoads = 0
    server.use(
      http.get('/v1/users/list/with-counts', () => {
        failedLoads += 1
        return HttpResponse.json({ message: 'down' }, { status: 500 })
      }),
    )
    await act(() =>
      queryClient.invalidateQueries({ queryKey: usersKeys.withCounts }),
    )

    await waitFor(() => expect(failedLoads).toBeGreaterThan(0))
    expect(bodyRows(table)).toHaveLength(4)
    expect(screen.getByRole('table', { name: 'Plex users' })).toBe(table)
    expect(screen.queryByText("Couldn't load the users.")).toBeNull()
  })

  it('says a resend cancelled the old request when the new one fails', async () => {
    const user = userEvent.setup()
    mockUsers()
    let cancelled = false
    server.use(
      http.post('/v1/plex/cancel-friend-request', () => {
        cancelled = true
        return HttpResponse.json({ success: true, message: 'ok' })
      }),
      http.post('/v1/plex/send-friend-request', () =>
        HttpResponse.json(
          {
            statusCode: 500,
            error: 'Internal Server Error',
            message: 'Unable to send friend request',
          },
          { status: 500 },
        ),
      ),
      http.get('/v1/plex/user-status', () =>
        HttpResponse.json({
          success: true,
          users: [],
          untracked: cancelled
            ? untracked.map((account) =>
                account.uuid === 'uuid-sam'
                  ? { ...account, status: 'server_only', pendingSince: null }
                  : account,
              )
            : untracked,
        }),
      ),
    )
    renderPage()
    await findTable()

    const card = screen.getByRole('list', { name: 'Not yet friends' })
    await user.click(
      within(card).getByRole('button', { name: 'Resend request' }),
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The old request was cancelled, but the new one was not sent. Send it again.',
    )
    await waitFor(() =>
      expect(
        within(card).getAllByRole('button', { name: 'Send friend request' }),
      ).toHaveLength(2),
    )
  })

  it('says a failed cancel was not cancelled', async () => {
    const user = userEvent.setup()
    mockUsers()
    server.use(
      http.post('/v1/plex/cancel-friend-request', () =>
        HttpResponse.json({}, { status: 500 }),
      ),
    )
    renderPage()
    await findTable()

    const card = screen.getByRole('list', { name: 'Not yet friends' })
    await user.click(
      within(card).getByRole('button', { name: 'Cancel request' }),
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The friend request was not cancelled. Try again.',
    )
  })
})
