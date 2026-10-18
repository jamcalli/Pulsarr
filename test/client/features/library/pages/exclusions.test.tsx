import { QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import ExclusionsPage from '@/features/library/pages/exclusions'
import { setFormatLocale } from '@/lib/format'
import { queryClient } from '@/lib/queryClient'
import { useProgressStore } from '@/stores/progressStore'
import type { components } from '@/types/api.js'
import { server } from '../../../setup.js'
import { stubViewport } from '../../../viewport.js'

type ExclusionItem = components['schemas']['WatchlistExclusionItem']
type MaintainerrStatus = components['schemas']['MaintainerrStatus']
type BulkCreatePayload =
  components['schemas']['WatchlistExclusionBulkCreatePayload']
type BulkCreateResult =
  components['schemas']['WatchlistExclusionBulkCreateResponse']['result']
type BulkRemovePayload =
  components['schemas']['WatchlistExclusionBulkRemovePayload']

const severance: ExclusionItem = {
  key: 'plex-sev',
  title: 'Severance',
  type: 'show',
  guids: ['tvdb:371980'],
  thumb: null,
  globalExclusion: null,
  watchlisterCount: 2,
  excludedCount: 1,
  users: [
    {
      userId: 2,
      userName: 'jamie',
      status: 'grabbed',
      added: '2026-02-01T00:00:00Z',
      ownExclusion: { id: 21, excludedAt: '2026-03-01T00:00:00Z' },
    },
    {
      userId: 1,
      userName: 'sarah',
      status: 'requested',
      added: '2026-02-02T00:00:00Z',
      ownExclusion: null,
    },
  ],
}

const dune: ExclusionItem = {
  key: 'plex-dune',
  title: 'Dune: Part Two',
  type: 'movie',
  guids: ['tmdb:693134'],
  thumb: null,
  globalExclusion: { id: 30, excludedAt: '2026-04-01T00:00:00Z' },
  watchlisterCount: 1,
  excludedCount: 1,
  users: [
    {
      userId: 1,
      userName: 'sarah',
      status: 'pending',
      added: '2026-02-03T00:00:00Z',
      ownExclusion: { id: 31, excludedAt: '2026-03-15T00:00:00Z' },
    },
  ],
}

const arrival: ExclusionItem = {
  key: 'plex-arr',
  title: 'Arrival',
  type: 'movie',
  guids: ['tmdb:329865'],
  thumb: null,
  globalExclusion: { id: 40, excludedAt: '2026-01-10T00:00:00Z' },
  watchlisterCount: 0,
  excludedCount: 0,
  users: [],
}

const andor: ExclusionItem = {
  key: 'plex-andor',
  title: 'Andor',
  type: 'show',
  guids: ['tvdb:393189'],
  thumb: null,
  globalExclusion: null,
  watchlisterCount: 1,
  excludedCount: 0,
  users: [
    {
      userId: 2,
      userName: 'jamie',
      status: 'notified',
      added: '2026-02-04T00:00:00Z',
      ownExclusion: null,
    },
  ],
}

const ROWS = [severance, dune, arrival, andor]

const connected: MaintainerrStatus = {
  status: 'ok',
  version: '3.23.1',
  connectedGroups: 2,
  testDelivered: true,
}

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

function mockEndpoints({
  rows = ROWS,
  saved = {
    maintainerrEnabled: true,
    maintainerrUrl: 'http://maintainerr:6246',
    maintainerrExclusionMode: 'watchlisters',
  },
  status = connected,
  createResult,
  itemsStatus = 200,
}: {
  rows?: ExclusionItem[]
  saved?: object
  status?: MaintainerrStatus | null
  createResult?: (body: BulkCreatePayload) => BulkCreateResult
  itemsStatus?: number
} = {}) {
  const calls = {
    queries: [] as URLSearchParams[],
    create: [] as BulkCreatePayload[],
    remove: [] as BulkRemovePayload[],
    deleted: [] as string[],
    config: [] as unknown[],
    status: 0,
    sync: 0,
  }
  let current: object = saved
  server.use(
    http.get('/v1/config', () =>
      HttpResponse.json({ success: true, config: current }),
    ),
    http.put('/v1/config', async ({ request }) => {
      const body = await request.json()
      calls.config.push(body)
      current = { ...current, ...(body as object) }
      return HttpResponse.json({ success: true, config: current })
    }),
    http.get('/v1/users/list', () =>
      HttpResponse.json({
        success: true,
        message: 'ok',
        users: [user(1, 'sarah', 'Mom'), user(2, 'jamie', null)],
      }),
    ),
    http.get('/v1/watchlist-exclusions/items', ({ request }) => {
      calls.queries.push(new URL(request.url).searchParams)
      if (itemsStatus !== 200) {
        return HttpResponse.json(
          {
            statusCode: itemsStatus,
            error: 'Internal Server Error',
            message: 'Failed to fetch watchlist exclusion items',
          },
          { status: itemsStatus },
        )
      }
      return HttpResponse.json({
        success: true,
        message: 'ok',
        items: rows,
        total: rows.length,
        limit: 20,
        offset: 0,
      })
    }),
    http.post<never, BulkCreatePayload>(
      '/v1/watchlist-exclusions/bulk',
      async ({ request }) => {
        const body = await request.json()
        calls.create.push(body)
        const result = createResult?.(body) ?? {
          created: body.items.length,
          skipped: 0,
          failed: [],
          errors: [],
          total: body.items.length,
        }
        return HttpResponse.json({ success: true, message: 'ok', result })
      },
    ),
    http.post<never, BulkRemovePayload>(
      '/v1/watchlist-exclusions/bulk/remove',
      async ({ request }) => {
        const body = await request.json()
        calls.remove.push(body)
        return HttpResponse.json({
          success: true,
          message: 'ok',
          result: {
            removed: body.ids.length,
            failed: [],
            errors: [],
            total: body.ids.length,
          },
        })
      },
    ),
    http.delete('/v1/watchlist-exclusions/:id', ({ params }) => {
      calls.deleted.push(String(params.id))
      return new HttpResponse(null, { status: 204 })
    }),
    http.get('/v1/notifications/maintainerr/status', () => {
      calls.status += 1
      return HttpResponse.json({ success: true, result: status })
    }),
    http.post('/v1/notifications/maintainerr/sync', () => {
      calls.sync += 1
      return HttpResponse.json({ success: true, result: status })
    }),
  )
  return calls
}

function renderPage(initialEntry = '/') {
  const router = createMemoryRouter(
    [{ path: '*', element: <ExclusionsPage /> }],
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
  return screen.findByRole('table', { name: 'Watchlist titles' })
}

function rowFor(table: HTMLElement, title: string) {
  const row = within(table)
    .getAllByRole('row')
    .find((entry) => within(entry).queryByText(title))
  if (!row) throw new Error(`No row for ${title}`)
  return within(row)
}

async function findSection(title: string) {
  const heading = await screen.findByText(title, {
    selector: '[data-slot="card-title"]',
  })
  const card = heading.closest('[data-slot="card"]')
  if (!(card instanceof HTMLElement)) throw new Error(`No card for ${title}`)
  return within(card)
}

function selectionBar() {
  return screen.getByRole('region', { name: 'Selection' })
}

async function openUsers(
  user: ReturnType<typeof userEvent.setup>,
  title: string,
) {
  const table = await findTable()
  const name = `${title} watchlisters`
  await user.click(within(table).getByRole('button', { name }))
  return within(await screen.findByRole('region', { name }))
}

async function openRowMenu(
  user: ReturnType<typeof userEvent.setup>,
  title: string,
) {
  const table = await findTable()
  await user.click(
    within(table).getByRole('button', { name: `Actions for ${title}` }),
  )
  return screen.findByRole('menu')
}

describe('ExclusionsPage', () => {
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
    vi.useRealTimers()
  })

  it('lists titles with their counts, newest exclusion first', async () => {
    const calls = mockEndpoints()
    renderPage()

    const table = await findTable()
    expect(rowFor(table, 'Severance').getByText('1 of 2')).toBeInTheDocument()
    expect(
      rowFor(table, 'Dune: Part Two').getByText('Everyone'),
    ).toBeInTheDocument()
    expect(rowFor(table, 'Andor').getByText('Never')).toBeInTheDocument()
    expect(
      within(table).queryByRole('button', { name: 'Arrival watchlisters' }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('columnheader', { name: 'Last excluded' }),
    ).toHaveAttribute('aria-sort', 'descending')
    expect(Object.fromEntries(calls.queries[0] ?? [])).toEqual({
      sortBy: 'excludedAt',
      sortOrder: 'desc',
      limit: '20',
      offset: '0',
    })
  })

  it('shows the watchlisters of an expanded row and the global line', async () => {
    const user = userEvent.setup()
    mockEndpoints()
    renderPage()

    const severanceUsers = await openUsers(user, 'Severance')
    expect(severanceUsers.getByText('Grabbed')).toBeInTheDocument()
    expect(severanceUsers.getByRole('button', { name: 'Remove' })).toBeVisible()
    expect(
      severanceUsers.queryByText(/^Excluded for everyone/),
    ).not.toBeInTheDocument()

    const duneUsers = await openUsers(user, 'Dune: Part Two')
    expect(
      duneUsers.getByText(
        'Excluded for everyone. Per-user exclusions below still apply if the global one is removed.',
      ),
    ).toBeInTheDocument()
    expect(duneUsers.getByText('Mom')).toBeInTheDocument()
  })

  it('excludes one watchlister through a one-item users request', async () => {
    const user = userEvent.setup()
    const calls = mockEndpoints()
    renderPage()

    const users = await openUsers(user, 'Severance')
    await user.click(users.getByRole('button', { name: 'Exclude' }))
    const dialog = await screen.findByRole('dialog', {
      name: 'Exclude Severance for Mom',
    })
    expect(
      within(dialog).getByText(
        'Pulsarr stops routing it for them. Delete sync can remove it once no watchlister is left unexcluded and deletion is on for shows.',
      ),
    ).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Exclude' }))

    await waitFor(() =>
      expect(calls.create).toEqual([
        {
          scope: 'users',
          items: [
            {
              key: 'plex-sev',
              title: 'Severance',
              type: 'show',
              guids: ['tvdb:371980'],
              userIds: [1],
            },
          ],
        },
      ]),
    )
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    )
  })

  it('removes one own exclusion by its id', async () => {
    const user = userEvent.setup()
    const calls = mockEndpoints()
    renderPage()

    const users = await openUsers(user, 'Severance')
    await user.click(users.getByRole('button', { name: 'Remove' }))
    const dialog = await screen.findByRole('dialog')
    expect(
      within(dialog).getByText(
        'Pulsarr routes it again for jamie on the next sync if it is still on their watchlist.',
      ),
    ).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Remove' }))

    await waitFor(() => expect(calls.deleted).toEqual(['21']))
  })

  it('excludes a title for everyone with its watchlisters', async () => {
    const user = userEvent.setup()
    const calls = mockEndpoints()
    renderPage()

    const menu = await openRowMenu(user, 'Severance')
    await user.click(
      within(menu).getByRole('menuitem', { name: 'Exclude for everyone' }),
    )
    const dialog = await screen.findByRole('dialog', {
      name: 'Exclude Severance for everyone',
    })
    await user.click(within(dialog).getByRole('button', { name: 'Exclude' }))

    await waitFor(() => expect(calls.create).toHaveLength(1))
    expect(calls.create[0]?.scope).toBe('global')
    expect(calls.create[0]?.items[0]?.userIds).toEqual([2, 1])
  })

  it('removes the global exclusion and says the own ones stay', async () => {
    const user = userEvent.setup()
    const calls = mockEndpoints()
    renderPage()

    const menu = await openRowMenu(user, 'Dune: Part Two')
    expect(
      within(menu).queryByRole('menuitem', { name: 'Exclude for everyone' }),
    ).not.toBeInTheDocument()
    await user.click(
      within(menu).getByRole('menuitem', { name: 'Remove global exclusion' }),
    )
    const dialog = await screen.findByRole('dialog', {
      name: 'Remove the global exclusion of Dune: Part Two',
    })
    expect(
      within(dialog).getByText(
        'Pulsarr routes it again for watchlisters without their own exclusion. 1 per-user exclusion stays.',
      ),
    ).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Remove' }))

    await waitFor(() => expect(calls.deleted).toEqual(['30']))
  })

  it('bulk excludes the selected rows for their watchlisters', async () => {
    const user = userEvent.setup()
    const calls = mockEndpoints()
    renderPage()
    await findTable()

    await user.click(screen.getByRole('checkbox', { name: 'Select Severance' }))
    await user.click(screen.getByRole('checkbox', { name: 'Select Arrival' }))
    await user.click(screen.getByRole('checkbox', { name: 'Select Andor' }))
    await user.click(
      within(selectionBar()).getByRole('button', { name: 'Exclude' }),
    )
    const dialog = await screen.findByRole('dialog', {
      name: 'Exclude 3 titles',
    })
    expect(
      within(dialog).getByText(
        '1 title has nobody left to exclude and is skipped.',
      ),
    ).toBeInTheDocument()
    await user.click(
      within(dialog).getByRole('button', { name: 'Exclude 2 titles' }),
    )

    await waitFor(() => expect(calls.create).toHaveLength(1))
    expect(calls.create[0]?.scope).toBe('users')
    expect(
      calls.create[0]?.items.map(({ key, userIds }) => ({ key, userIds })),
    ).toEqual([
      { key: 'plex-sev', userIds: [1] },
      { key: 'plex-andor', userIds: [2] },
    ])
    await waitFor(() =>
      expect(
        screen.queryByRole('region', { name: 'Selection' }),
      ).not.toBeInTheDocument(),
    )
  })

  it('bulk excludes the selected rows for everyone', async () => {
    const user = userEvent.setup()
    const calls = mockEndpoints()
    renderPage()
    await findTable()

    await user.click(screen.getByRole('checkbox', { name: 'Select Severance' }))
    await user.click(
      screen.getByRole('checkbox', { name: 'Select Dune: Part Two' }),
    )
    await user.click(
      within(selectionBar()).getByRole('button', { name: 'Exclude' }),
    )
    const dialog = await screen.findByRole('dialog', {
      name: 'Exclude 2 titles',
    })
    await user.click(within(dialog).getByRole('radio', { name: /Everyone/ }))
    expect(
      within(dialog).getByText(
        '1 title has a global exclusion already and is skipped.',
      ),
    ).toBeInTheDocument()
    await user.click(
      within(dialog).getByRole('button', { name: 'Exclude 1 title' }),
    )

    await waitFor(() => expect(calls.create).toHaveLength(1))
    expect(calls.create[0]?.scope).toBe('global')
    expect(calls.create[0]?.items.map(({ key }) => key)).toEqual(['plex-sev'])
  })

  it('bulk removes every exclusion id on the selected rows', async () => {
    const user = userEvent.setup()
    const calls = mockEndpoints()
    renderPage()
    await findTable()

    await user.click(screen.getByRole('checkbox', { name: 'Select Severance' }))
    await user.click(
      screen.getByRole('checkbox', { name: 'Select Dune: Part Two' }),
    )
    await user.click(
      within(selectionBar()).getByRole('button', { name: 'Remove' }),
    )
    const dialog = await screen.findByRole('dialog', {
      name: 'Remove exclusions from 2 titles',
    })
    expect(
      within(dialog).getByText(
        'Pulsarr routes these titles again on the next sync for anyone still watching them.',
      ),
    ).toBeInTheDocument()
    await user.click(
      within(dialog).getByRole('button', { name: 'Remove 3 exclusions' }),
    )

    await waitFor(() => expect(calls.remove).toEqual([{ ids: [21, 30, 31] }]))
  })

  it('keeps failed titles selected and shows the alert', async () => {
    const user = userEvent.setup()
    mockEndpoints({
      createResult: (body) => ({
        created: 1,
        skipped: 0,
        failed: ['plex-andor'],
        errors: ['Andor: database is locked'],
        total: body.items.length,
      }),
    })
    renderPage()
    await findTable()

    await user.click(screen.getByRole('checkbox', { name: 'Select Severance' }))
    await user.click(screen.getByRole('checkbox', { name: 'Select Andor' }))
    await user.click(
      within(selectionBar()).getByRole('button', { name: 'Exclude' }),
    )
    const dialog = await screen.findByRole('dialog', {
      name: 'Exclude 2 titles',
    })
    await user.click(
      within(dialog).getByRole('button', { name: 'Exclude 2 titles' }),
    )

    expect(
      await screen.findByText('1 of 2 titles was not excluded.'),
    ).toBeInTheDocument()
    expect(screen.getByText('Andor: database is locked')).toBeInTheDocument()
    expect(within(selectionBar()).getByText('1 selected')).toBeInTheDocument()
    expect(
      screen.getByRole('checkbox', { name: 'Select Andor' }),
    ).toHaveAttribute('aria-checked', 'true')
  })

  it('drives the request from the URL and writes filters back', async () => {
    const user = userEvent.setup()
    const calls = mockEndpoints()
    const router = renderPage(
      '/?q=sev&user=1&type=show&status=grabbed&exclusion=excluded&sort=title&dir=asc&page=2',
    )

    await findTable()
    expect(Object.fromEntries(calls.queries[0] ?? [])).toEqual({
      search: 'sev',
      userId: '1',
      type: 'show',
      status: 'grabbed',
      exclusion: 'excluded',
      sortBy: 'title',
      sortOrder: 'asc',
      limit: '20',
      offset: '20',
    })
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'User' })).toHaveTextContent(
        'Mom',
      ),
    )

    await user.click(screen.getByRole('combobox', { name: 'Exclusion' }))
    await user.click(
      await screen.findByRole('option', { name: 'No watchlisters' }),
    )

    await waitFor(() =>
      expect(router.state.location.search).toContain('exclusion=orphan'),
    )
    expect(router.state.location.search).not.toContain('page=')
    await waitFor(() =>
      expect(calls.queries.at(-1)?.get('exclusion')).toBe('orphan'),
    )
  })

  it('freezes the table while the Maintainerr form is dirty', async () => {
    const user = userEvent.setup()
    mockEndpoints()
    renderPage()
    await findTable()

    await user.click(screen.getByRole('checkbox', { name: 'Select Severance' }))
    expect(selectionBar()).toBeInTheDocument()

    const section = await findSection('Maintainerr')
    await user.click(section.getByRole('switch', { name: 'Use Maintainerr' }))

    expect(
      await screen.findByText(
        'Save or discard the Maintainerr changes to edit exclusions.',
      ),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('region', { name: 'Selection' }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Actions for Severance' }),
    ).toBeDisabled()
  })

  it('rejects turning Maintainerr on without a URL', async () => {
    const user = userEvent.setup()
    const calls = mockEndpoints({
      saved: {
        maintainerrEnabled: false,
        maintainerrUrl: '',
        maintainerrExclusionMode: 'watchlisters',
      },
    })
    renderPage()

    const section = await findSection('Maintainerr')
    expect(section.getByText('Disabled')).toBeInTheDocument()
    await user.click(section.getByRole('switch', { name: 'Use Maintainerr' }))
    await user.click(section.getByLabelText('Maintainerr URL'))
    await user.tab()

    expect(
      await section.findByText('Enter the Maintainerr URL to turn it on.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled()
    expect(calls.config).toEqual([])
  })

  it('shows a failed test delivery as a warning', async () => {
    mockEndpoints({
      status: {
        status: 'ok',
        version: '3.23.1',
        connectedGroups: 2,
        testDelivered: false,
        error: 'The test notification never arrived.',
      },
    })
    renderPage()

    const section = await findSection('Maintainerr')
    expect(await section.findByText('Test not delivered')).toBeInTheDocument()
    expect(section.getByText('Not delivered')).toBeInTheDocument()
  })

  it('tells the admin to upgrade a Maintainerr that is too old', async () => {
    mockEndpoints({
      status: { status: 'unsupported_version', version: '3.10.0' },
    })
    renderPage()

    const section = await findSection('Maintainerr')
    expect(
      await section.findByText(
        'Maintainerr 3.10.0 is too old. Upgrade to 3.23.0 or later.',
      ),
    ).toBeInTheDocument()
    expect(section.getByText('Unsupported version')).toBeInTheDocument()
  })

  it('shows a reconcile error verbatim', async () => {
    mockEndpoints({
      status: { status: 'error', error: 'connect ECONNREFUSED' },
    })
    renderPage()

    const section = await findSection('Maintainerr')
    expect(await section.findByText('connect ECONNREFUSED')).toBeInTheDocument()
    expect(section.getByText('Error')).toBeInTheDocument()
  })

  it('syncs now and polls the status after', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const calls = mockEndpoints()
    renderPage()

    const section = await findSection('Maintainerr')
    expect(await section.findByText('Connected')).toBeInTheDocument()
    await user.click(section.getByRole('button', { name: 'Sync now' }))

    await waitFor(() => expect(calls.sync).toBe(1))
    const before = calls.status
    await act(() => vi.advanceTimersByTimeAsync(2500))
    await waitFor(() => expect(calls.status).toBeGreaterThan(before))
  })

  it('shows the load error with a retry', async () => {
    mockEndpoints({ itemsStatus: 500 })
    renderPage()

    expect(
      await screen.findByRole('alert', {}, { timeout: 3000 }),
    ).toHaveTextContent('Failed to fetch watchlist exclusion items')
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })

  it('says nothing is on a watchlist yet with no filters', async () => {
    mockEndpoints({ rows: [] })
    renderPage()

    expect(
      await screen.findByText('Nothing on a watchlist yet'),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('searchbox', { name: 'Search titles' }),
    ).not.toBeInTheDocument()
  })
})
