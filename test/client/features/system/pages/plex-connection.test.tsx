import type {
  ProgressEvent,
  WatchlistSyncType,
} from '@root/types/progress.types'
import { QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { delay, HttpResponse, http } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import PlexConnectionPage from '@/features/system/pages/plex-connection'
import { setFormatLocale } from '@/lib/format'
import { plexConnectionKeys, usersKeys } from '@/lib/query-keys'
import { queryClient } from '@/lib/queryClient'
import { useProgressStore } from '@/stores/progressStore'
import type { components } from '@/types/api.js'
import { refetchAndRender, serverError } from '../../../refetch.js'
import { server } from '../../../setup.js'
import { stubViewport } from '../../../viewport.js'

type ConfigUpdate = components['schemas']['ConfigUpdatePayload']
type UserWithCount = components['schemas']['UserWithCount']
type NotificationPayload =
  components['schemas']['PlexNotificationConfigPayload']

const TOKEN = 'linked-token-9f2c'
const NEW_TOKEN = 'pasted-token-41ab'
const RUN_TIMEOUT = { timeout: 6000 }
const FEEDS = {
  selfRss: 'https://rss.plex.tv/self-feed',
  friendsRss: 'https://rss.plex.tv/friends-feed',
}

const LINKED: ConfigUpdate = {
  plexTokens: [TOKEN],
  plexServerUrl: '',
  skipIfExistsOnPlex: true,
  plexExistenceScope: 'owned-and-shared',
  ...FEEDS,
}
const NOT_LINKED: ConfigUpdate = {
  plexTokens: [],
  plexServerUrl: '',
  skipIfExistsOnPlex: true,
  plexExistenceScope: 'owned-and-shared',
  selfRss: '',
  friendsRss: '',
}

function user(id: number, count: number, primary = false): UserWithCount {
  return {
    id,
    name: `user-${id}`,
    apprise: null,
    alias: null,
    discord_id: null,
    notify_apprise: false,
    notify_discord: false,
    notify_discord_mention: false,
    notify_plex_mobile: false,
    can_sync: true,
    requires_approval: false,
    is_primary_token: primary,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    friendStatus: null,
    pendingSince: null,
    watchlist_count: count,
  }
}

function arrInstance(id: number, name: string) {
  return {
    id,
    name,
    baseUrl: `http://arr-${id}`,
    apiKey: `key-${id}`,
    bypassIgnored: false,
    searchOnAdd: true,
    tags: [],
    isDefault: id === 1,
  }
}

function result(id: number, name: string, success: boolean, message = 'ok') {
  return { id, name, success, message }
}

const STATUS = {
  radarr: [result(1, 'Radarr', true), result(2, 'Radarr 4K', false)],
  sonarr: [result(1, 'Sonarr', false)],
}

type Step = 'ping' | 'self' | 'friends' | 'pass' | 'feeds'

type ConnectionTest = components['schemas']['PlexTestConnectionResponse']
type SyncStatus = components['schemas']['WatchlistSyncStatus']

const IDLE_SYNC: SyncStatus = {
  state: 'idle',
  startedAt: null,
  finishedAt: null,
  error: null,
  total: null,
  friends: null,
}

const SYNC_STEPS: Record<WatchlistSyncType, Step> = {
  'self-watchlist': 'self',
  'others-watchlist': 'friends',
}

const SYNC_COUNTS: Record<
  WatchlistSyncType,
  Pick<SyncStatus, 'total' | 'friends'>
> = {
  'self-watchlist': { total: 214, friends: null },
  'others-watchlist': { total: 1032, friends: 0 },
}

function emitSettled(type: WatchlistSyncType, phase: 'complete' | 'failed') {
  const event: ProgressEvent = {
    operationId: `${type}-sync`,
    type,
    phase,
    progress: 100,
    message: phase,
    metadata: { stage: phase, count: null },
  }
  for (const callback of useProgressStore
    .getState()
    .typeSubscribers.get(type) ?? []) {
    callback(event)
  }
}

const REACHED: ConnectionTest = {
  success: true,
  message: 'Connected to the Plex server.',
  url: 'https://192-168-1-100.abc.plex.direct:32400',
  automatic: true,
}

function mockEndpoints({
  config = LINKED,
  hasPlexPass = true,
  instances = true,
  ping = () => true,
  connectionTest = REACHED,
  fail = [],
  pins = [{ authToken: TOKEN, expiresIn: 600 }],
  holdSync = {},
}: {
  config?: ConfigUpdate
  hasPlexPass?: boolean
  instances?: boolean
  ping?: (tokens: string[]) => boolean
  connectionTest?: ConnectionTest
  fail?: Step[]
  pins?: Array<{ authToken: string | null; expiresIn: number }>
  /** Keeps a sync running until the promise resolves. */
  holdSync?: Partial<Record<WatchlistSyncType, Promise<void>>>
} = {}) {
  let saved: ConfigUpdate = { ...config }
  let pinIndex = 0
  const calls = {
    config: [] as ConfigUpdate[],
    steps: [] as Array<{ step: Step; start: number; end: number }>,
    pinsCreated: 0,
    discover: [] as string[],
    connectionTest: 0,
    setup: [] as NotificationPayload[],
    removed: 0,
  }
  const step = async (name: Step, body: () => Response) => {
    const entry = { step: name, start: performance.now(), end: 0 }
    calls.steps.push(entry)
    await delay(30)
    entry.end = performance.now()
    if (fail.includes(name)) {
      return HttpResponse.json(
        {
          statusCode: 500,
          error: 'Internal Server Error',
          message: `${name} failed upstream`,
        },
        { status: 500 },
      )
    }
    return body()
  }
  const syncs: Record<WatchlistSyncType, SyncStatus> = {
    'self-watchlist': IDLE_SYNC,
    'others-watchlist': IDLE_SYNC,
  }
  const runSync = async (type: WatchlistSyncType) => {
    const name = SYNC_STEPS[type]
    const entry = { step: name, start: performance.now(), end: 0 }
    calls.steps.push(entry)
    syncs[type] = {
      ...IDLE_SYNC,
      state: 'running',
      startedAt: new Date().toISOString(),
    }
    await Promise.all([delay(30), holdSync[type]])
    entry.end = performance.now()
    const finishedAt = new Date().toISOString()
    syncs[type] = fail.includes(name)
      ? {
          ...syncs[type],
          state: 'failed',
          finishedAt,
          error: `${name} failed upstream`,
        }
      : { ...syncs[type], state: 'done', finishedAt, ...SYNC_COUNTS[type] }
    emitSettled(type, fail.includes(name) ? 'failed' : 'complete')
  }
  server.use(
    http.get('/v1/config', () =>
      HttpResponse.json({ success: true, config: saved }),
    ),
    http.put<never, ConfigUpdate>('/v1/config', async ({ request }) => {
      const body = await request.json()
      calls.config.push(body)
      if (body.plexTokens?.length && !ping(body.plexTokens)) {
        return HttpResponse.json(
          {
            statusCode: 409,
            error: 'Conflict',
            message: 'Plex did not accept the token',
          },
          { status: 409 },
        )
      }
      saved = { ...saved, ...body }
      return HttpResponse.json({ success: true, config: saved })
    }),
    http.get('/v1/users/list/with-counts', () =>
      HttpResponse.json({
        success: true,
        message: 'ok',
        users: [user(1, 214, true), user(2, 1000), user(3, 32)],
      }),
    ),
    http.get('/v1/plex/plex-pass-status', () =>
      step('pass', () => HttpResponse.json({ hasPlexPass })),
    ),
    http.get('/v1/radarr/instances', () =>
      HttpResponse.json(
        instances
          ? [arrInstance(1, 'Radarr'), arrInstance(2, 'Radarr 4K')]
          : [],
      ),
    ),
    http.get('/v1/sonarr/instances', () =>
      HttpResponse.json(instances ? [arrInstance(1, 'Sonarr')] : []),
    ),
    http.get('/v1/plex/notification-status', () =>
      HttpResponse.json({ success: true, message: 'ok', results: STATUS }),
    ),
    http.post<never, NotificationPayload>(
      '/v1/plex/configure-notifications',
      async ({ request }) => {
        calls.setup.push(await request.json())
        return HttpResponse.json({
          success: true,
          message: 'ok',
          results: {
            radarr: [
              result(1, 'Radarr', true),
              result(2, 'Radarr 4K', false, 'connect ECONNREFUSED 10.0.0.4'),
            ],
            sonarr: [result(1, 'Sonarr', true)],
          },
        })
      },
    ),
    http.delete('/v1/plex/remove-notifications', () => {
      calls.removed += 1
      return HttpResponse.json({
        success: true,
        message: 'ok',
        results: {
          radarr: [result(1, 'Radarr', true), result(2, 'Radarr 4K', true)],
          sonarr: [result(1, 'Sonarr', true)],
        },
      })
    }),
    http.get('/v1/plex/ping', () =>
      step('ping', () =>
        ping(saved.plexTokens ?? [])
          ? HttpResponse.json({ success: true })
          : HttpResponse.json(
              {
                statusCode: 401,
                error: 'Unauthorized',
                message: 'Plex did not accept the token',
              },
              { status: 401 },
            ),
      ),
    ),
    http.get('/v1/plex/test-connection', () => {
      calls.connectionTest += 1
      return HttpResponse.json(connectionTest)
    }),
    http.post<{ type: WatchlistSyncType }>(
      '/v1/plex/watchlist-sync/:type/start',
      ({ params }) => {
        void runSync(params.type)
        return HttpResponse.json({ message: 'started' }, { status: 202 })
      },
    ),
    http.get<{ type: WatchlistSyncType }>(
      '/v1/plex/watchlist-sync/:type/status',
      ({ params }) => HttpResponse.json(syncs[params.type]),
    ),
    http.get('/v1/plex/generate-rss-feeds', () =>
      step('feeds', () => {
        saved = { ...saved, ...FEEDS }
        return HttpResponse.json({
          self: FEEDS.selfRss,
          friends: FEEDS.friendsRss,
        })
      }),
    ),
    http.post('/v1/plex/pin', () => {
      calls.pinsCreated += 1
      return HttpResponse.json({
        id: calls.pinsCreated,
        code: `K7Q${calls.pinsCreated}`,
        qr: 'https://plex.tv/qr.png',
        expiresAt: '2026-10-14T14:28:00Z',
        clientId: 'client-1',
      })
    }),
    http.get('/v1/plex/pin/:pinId', () => {
      const pin = pins[Math.min(pinIndex, pins.length - 1)]
      pinIndex += 1
      return HttpResponse.json(pin)
    }),
    http.post<never, { plexToken: string }>(
      '/v1/plex/discover-servers',
      async ({ request }) => {
        calls.discover.push((await request.json()).plexToken)
        return HttpResponse.json({
          success: true,
          servers: [
            {
              name: 'Basement',
              host: '192.168.1.100',
              port: 32400,
              useSsl: true,
              local: true,
              success: true,
              message: 'Connected to the Plex server.',
            },
            {
              name: 'Basement',
              host: '73.42.118.9',
              port: 32400,
              useSsl: false,
              local: false,
              success: false,
              message: "Couldn't reach the Plex server at this address.",
            },
          ],
        })
      },
    ),
  )
  return calls
}

function renderPage() {
  const router = createMemoryRouter([
    { path: '*', element: <PlexConnectionPage /> },
  ])
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

async function findSection(title: string) {
  const heading = await screen.findByText(title, {
    selector: '[data-slot="card-title"]',
  })
  const card = heading.closest('[data-slot="card"]')
  if (!(card instanceof HTMLElement)) throw new Error(`No card for ${title}`)
  return within(card)
}

async function accountPill() {
  const account = await findSection('Plex account')
  const [pill] = account.getAllByRole('status')
  if (!pill) throw new Error('No account pill')
  return pill
}

function stepPills() {
  const list = screen.getByRole('list', { name: 'Sync steps' })
  return within(list)
    .getAllByRole('listitem')
    .map((item) => item.textContent)
}

function emitProgress(type: WatchlistSyncType, event: ProgressEvent) {
  act(() => {
    useProgressStore.setState((state) => ({
      watchlistSyncCache: { ...state.watchlistSyncCache, [type]: event },
    }))
  })
}

const FRIENDS_READING: ProgressEvent = {
  operationId: 'others-watchlist-sync',
  type: 'others-watchlist',
  phase: 'reading',
  progress: 35,
  message: 'Alice page 3, Bob page 1',
  metadata: {
    stage: 'reading',
    count: { done: 4, total: 12, unit: 'friends' },
  },
}

const FRIENDS_COMPLETE: ProgressEvent = {
  ...FRIENDS_READING,
  phase: 'complete',
  progress: 100,
  message: 'Synced',
  metadata: { stage: 'complete', count: null },
}

function friendsRow(list: HTMLElement) {
  const row = within(list)
    .getAllByRole('listitem')
    .find((item) => item.textContent?.startsWith("Friends' watchlists"))
  if (!row) throw new Error('No friends row')
  return row
}

function recorded(
  steps: Array<{ step: Step; start: number; end: number }>,
  step: Step,
) {
  const entry = steps.find((candidate) => candidate.step === step)
  if (!entry) throw new Error(`No ${step} request`)
  return entry
}

async function pasteToken(token: string) {
  const user = userEvent.setup()
  const account = await findSection('Plex account')
  await user.click(account.getByRole('button', { name: 'Paste token' }))
  const dialog = await screen.findByRole('dialog', { name: 'Paste a token' })
  await user.type(within(dialog).getByLabelText('Plex token'), token)
  await user.click(within(dialog).getByRole('button', { name: 'Link account' }))
  return { user, dialog }
}

describe('PlexConnectionPage', () => {
  beforeEach(() => {
    setFormatLocale('en-US')
    stubViewport({ mobile: false })
    useProgressStore.setState({
      isConnecting: true,
      systemStatusCache: {},
      watchlistSyncCache: {},
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    queryClient.clear()
    setFormatLocale(undefined)
    vi.unstubAllGlobals()
  })

  it('shows the linked facts from the users list without syncing', async () => {
    const calls = mockEndpoints()
    renderPage()

    expect(await accountPill()).toHaveTextContent('Linked')
    const account = await findSection('Plex account')
    expect(account.getByText('214 items')).toBeInTheDocument()
    expect(account.getByText('2 friends, 1,032 items')).toBeInTheDocument()
    expect(account.getByText('RSS')).toBeInTheDocument()
    expect(account.getByLabelText('Your watchlist feed')).toHaveValue(
      FEEDS.selfRss,
    )
    expect(calls.steps.filter((entry) => entry.step !== 'pass')).toEqual([])
  })

  it('masks the feed URLs until revealed', async () => {
    const user = userEvent.setup()
    mockEndpoints()
    renderPage()

    const account = await findSection('Plex account')
    const feed = await account.findByLabelText('Your watchlist feed')
    expect(feed).toHaveAttribute('type', 'password')

    await user.click(
      account.getByRole('button', { name: 'Show your watchlist feed' }),
    )

    expect(feed).toHaveAttribute('type', 'text')
  })

  it('never renders the stored token', async () => {
    mockEndpoints()
    renderPage()
    await findSection('Plex library refresh')
    await screen.findByRole('table', { name: 'Library refresh by instance' })

    expect(document.body.textContent).not.toContain(TOKEN)
    const values = [...document.querySelectorAll('input')].map(
      (input) => input.value,
    )
    expect(values).not.toContain(TOKEN)
  })

  it("verifies, then syncs your and friends' watchlists together", async () => {
    const user = userEvent.setup()
    const calls = mockEndpoints()
    renderPage()
    const account = await findSection('Plex account')

    await user.click(account.getByRole('button', { name: 'Sync watchlists' }))

    await waitFor(
      () =>
        expect(stepPills().every((text) => text?.endsWith('Done'))).toBe(true),
      RUN_TIMEOUT,
    )
    const synced = calls.steps.filter((entry) => entry.step !== 'pass')
    const [ping, ...watchlists] = synced
    expect(ping?.step).toBe('ping')
    expect(watchlists.map((entry) => entry.step).sort()).toEqual([
      'friends',
      'self',
    ])
    for (const entry of watchlists) {
      expect(entry.start).toBeGreaterThanOrEqual(ping?.end ?? 0)
    }
    const [first, second] = watchlists
    expect(second?.start).toBeLessThan(first?.end ?? 0)
  })

  it("shows the friends' sync progress while it runs", async () => {
    const user = userEvent.setup()
    let release = () => {}
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    mockEndpoints({ holdSync: { 'others-watchlist': held } })
    renderPage()
    const account = await findSection('Plex account')

    await user.click(account.getByRole('button', { name: 'Sync watchlists' }))

    const list = await screen.findByRole('list', { name: 'Sync steps' })
    const friends = friendsRow(list)
    expect(await within(friends).findByText('Starting')).toBeInTheDocument()

    emitProgress('others-watchlist', FRIENDS_READING)

    expect(
      within(friends).getByText('Alice page 3, Bob page 1'),
    ).toBeInTheDocument()
    expect(within(friends).getByText('4 of 12 friends')).toBeInTheDocument()
    expect(within(friends).getByRole('progressbar')).toHaveAttribute(
      'aria-valuenow',
      '35',
    )

    emitProgress('others-watchlist', FRIENDS_COMPLETE)
    release()
    await waitFor(
      () =>
        expect(stepPills().every((text) => text?.endsWith('Done'))).toBe(true),
      RUN_TIMEOUT,
    )
    expect(within(friends).queryByRole('progressbar')).not.toBeInTheDocument()
  })

  it('shows a sync already running on the server and locks Sync', async () => {
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    const calls = mockEndpoints()
    useProgressStore.setState({
      watchlistSyncCache: { 'others-watchlist': FRIENDS_READING },
    })
    renderPage()
    const account = await findSection('Plex account')

    const friends = friendsRow(
      await screen.findByRole('list', { name: 'Sync steps' }),
    )
    expect(stepPills()).toHaveLength(1)
    expect(within(friends).queryByText('Running')).not.toBeInTheDocument()
    expect(
      within(friends).getByText('Alice page 3, Bob page 1'),
    ).toBeInTheDocument()
    expect(within(friends).getByText('4 of 12 friends')).toBeInTheDocument()
    expect(within(friends).getByRole('progressbar')).toHaveAttribute(
      'aria-valuenow',
      '35',
    )
    expect(account.getByRole('button', { name: 'Syncing...' })).toBeDisabled()

    invalidate.mockClear()
    emitProgress('others-watchlist', FRIENDS_COMPLETE)

    expect(
      await account.findByRole('button', { name: 'Sync watchlists' }),
    ).toBeEnabled()
    expect(
      screen.queryByRole('list', { name: 'Sync steps' }),
    ).not.toBeInTheDocument()
    expect(
      invalidate.mock.calls.map(([filters]) => filters?.queryKey),
    ).toContainEqual(usersKeys.withCounts)
    expect(calls.steps.filter((entry) => entry.step !== 'pass')).toEqual([])
  })

  it('locks Sync while Pulsarr is starting up', async () => {
    mockEndpoints()
    useProgressStore.setState({
      systemStatusCache: {
        'watchlist-workflow-status': {
          operationId: 'watchlist-workflow-status',
          type: 'system',
          phase: 'info',
          progress: 0,
          message: 'Watchlist workflow status',
          metadata: { status: 'starting', syncMode: 'rss', rssAvailable: true },
        },
      },
    })
    renderPage()
    const account = await findSection('Plex account')

    expect(
      await account.findByRole('button', { name: 'Syncing...' }),
    ).toBeDisabled()
    expect(
      screen.queryByRole('list', { name: 'Sync steps' }),
    ).not.toBeInTheDocument()
  })

  it('links a pasted token, reads both watchlists together, then the feeds', async () => {
    const calls = mockEndpoints({ config: NOT_LINKED })
    renderPage()
    expect(await accountPill()).toHaveTextContent('Not linked')

    await pasteToken(NEW_TOKEN)

    await waitFor(
      () =>
        expect(screen.getByText('Both feed URLs saved')).toBeInTheDocument(),
      RUN_TIMEOUT,
    )
    expect(calls.config[0]).toEqual({ plexTokens: [NEW_TOKEN] })
    const self = recorded(calls.steps, 'self')
    const friends = recorded(calls.steps, 'friends')
    expect(friends.start).toBeLessThan(self.end)
    expect(recorded(calls.steps, 'feeds').start).toBeGreaterThanOrEqual(
      Math.max(self.end, friends.end),
    )
    expect(stepPills()).toEqual([
      'Verify the tokenDone',
      'Your watchlist214 itemsDone',
      "Friends' watchlists0 friends, 1,032 itemsDone",
      'Watchlist feedsBoth feed URLs savedDone',
    ])
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('skips only the feeds when the owner sync fails', async () => {
    const calls = mockEndpoints({ config: NOT_LINKED, fail: ['self'] })
    renderPage()

    await pasteToken(NEW_TOKEN)

    await waitFor(
      () =>
        expect(stepPills()).toEqual([
          'Verify the tokenDone',
          'Your watchlistFailed',
          "Friends' watchlists0 friends, 1,032 itemsDone",
          'Watchlist feedsSkipped',
        ]),
      RUN_TIMEOUT,
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'self failed upstream',
    )
    const steps = calls.steps.map((entry) => entry.step)
    expect(steps).toContain('friends')
    expect(steps).not.toContain('feeds')
  })

  it('skips the feeds and locks Generate without Plex Pass', async () => {
    const calls = mockEndpoints({ config: NOT_LINKED, hasPlexPass: false })
    renderPage()

    await pasteToken(NEW_TOKEN)

    await waitFor(
      () =>
        expect(stepPills().at(-1)).toContain('Watchlist feedsNeeds Plex Pass'),
      RUN_TIMEOUT,
    )
    expect(stepPills().at(-1)).toMatch(/Skipped$/)
    expect(calls.steps.map((entry) => entry.step)).not.toContain('feeds')
    const account = await findSection('Plex account')
    expect(
      await account.findByRole('button', { name: 'Generate feeds' }),
    ).toBeDisabled()
  })

  it('keeps the previous token when Plex rejects the new one', async () => {
    const calls = mockEndpoints({
      config: NOT_LINKED,
      ping: (tokens) => !tokens.includes(NEW_TOKEN),
    })
    renderPage()

    const { dialog } = await pasteToken(NEW_TOKEN)

    expect(await within(dialog).findByRole('alert')).toBeInTheDocument()
    expect(
      await within(dialog).findByRole('button', { name: 'Link account' }),
    ).toBeDisabled()
    expect(calls.config).toEqual([{ plexTokens: [NEW_TOKEN] }])
    expect(calls.steps.map((entry) => entry.step)).toEqual(['pass'])
    expect(await accountPill()).toHaveTextContent('Not linked')
  })

  it('asks before closing the token credenza with a typed token', async () => {
    const user = userEvent.setup()
    mockEndpoints({ config: NOT_LINKED })
    renderPage()
    const account = await findSection('Plex account')

    await user.click(account.getByRole('button', { name: 'Paste token' }))
    const dialog = await screen.findByRole('dialog', { name: 'Paste a token' })
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Paste a token' }),
      ).toBeNull(),
    )
    expect(
      screen.queryByRole('dialog', { name: 'Leave without saving?' }),
    ).toBeNull()

    await user.click(account.getByRole('button', { name: 'Paste token' }))
    const reopened = await screen.findByRole('dialog', {
      name: 'Paste a token',
    })
    await user.type(within(reopened).getByLabelText('Plex token'), NEW_TOKEN)
    await user.click(within(reopened).getByRole('button', { name: 'Cancel' }))
    const leave = await screen.findByRole('dialog', {
      name: 'Leave without saving?',
    })
    await user.click(within(leave).getByRole('button', { name: 'Stay' }))
    expect(within(reopened).getByLabelText('Plex token')).toHaveValue(NEW_TOKEN)

    await user.click(within(reopened).getByRole('button', { name: 'Cancel' }))
    await user.click(
      within(
        await screen.findByRole('dialog', { name: 'Leave without saving?' }),
      ).getByRole('button', { name: 'Leave' }),
    )
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Paste a token' }),
      ).toBeNull(),
    )
  })

  it('accepts a different token after one is rejected', async () => {
    mockEndpoints({
      config: NOT_LINKED,
      ping: (tokens) => !tokens.includes('bad-token'),
    })
    renderPage()
    const { user, dialog } = await pasteToken('bad-token')
    await within(dialog).findByRole('alert')

    const field = within(dialog).getByLabelText('Plex token')
    await waitFor(() => expect(field).toBeEnabled())
    await user.clear(field)
    await user.type(field, NEW_TOKEN)
    await user.click(
      within(dialog).getByRole('button', { name: 'Link account' }),
    )

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull(), {
      timeout: 3000,
    })
    await waitFor(
      () =>
        expect(screen.getByText('Both feed URLs saved')).toBeInTheDocument(),
      RUN_TIMEOUT,
    )
    expect(await accountPill()).toHaveTextContent('Linked')
  })

  it('signs in with a PIN, saves the token and syncs', async () => {
    const user = userEvent.setup()
    const calls = mockEndpoints({
      config: NOT_LINKED,
      pins: [{ authToken: NEW_TOKEN, expiresIn: 600 }],
    })
    renderPage()
    const account = await findSection('Plex account')

    await user.click(account.getByRole('button', { name: 'Sign in with Plex' }))

    await waitFor(
      () =>
        expect(screen.getByText('Both feed URLs saved')).toBeInTheDocument(),
      RUN_TIMEOUT,
    )
    expect(calls.pinsCreated).toBe(1)
    expect(calls.config[0]).toEqual({ plexTokens: [NEW_TOKEN] })
    expect(await accountPill()).toHaveTextContent('Linked')
  })

  it('offers a new code when the PIN expires', async () => {
    const user = userEvent.setup()
    const calls = mockEndpoints({
      config: NOT_LINKED,
      pins: [
        { authToken: null, expiresIn: 0 },
        { authToken: null, expiresIn: 600 },
      ],
    })
    renderPage()
    const account = await findSection('Plex account')
    await user.click(account.getByRole('button', { name: 'Sign in with Plex' }))
    const dialog = await screen.findByRole('dialog', {
      name: 'Sign in with Plex',
    })

    await user.click(
      await within(dialog).findByRole('button', { name: 'Get a new code' }),
    )

    expect(await within(dialog).findByText('Code K 7 Q 2')).toBeInTheDocument()
    expect(calls.pinsCreated).toBe(2)
    expect(calls.config).toEqual([])
  })

  it('shows the failure when checking the PIN fails', async () => {
    const user = userEvent.setup()
    const calls = mockEndpoints({ config: NOT_LINKED })
    server.use(http.get('/v1/plex/pin/:pinId', serverError))
    renderPage()
    const account = await findSection('Plex account')
    await user.click(account.getByRole('button', { name: 'Sign in with Plex' }))
    const dialog = await screen.findByRole('dialog', {
      name: 'Sign in with Plex',
    })

    expect(
      await within(dialog).findByText("Couldn't check the code with Plex."),
    ).toBeInTheDocument()
    expect(within(dialog).getByText('Down')).toBeInTheDocument()
    expect(calls.config).toEqual([])
  })

  it('shows the failure when a later PIN check fails', async () => {
    const user = userEvent.setup()
    mockEndpoints({
      config: NOT_LINKED,
      pins: [{ authToken: null, expiresIn: 600 }],
    })
    renderPage()
    const account = await findSection('Plex account')
    await user.click(account.getByRole('button', { name: 'Sign in with Plex' }))
    const dialog = await screen.findByRole('dialog', {
      name: 'Sign in with Plex',
    })
    expect(await within(dialog).findByText('K7Q1')).toBeInTheDocument()

    server.use(http.get('/v1/plex/pin/:pinId', serverError))
    await refetchAndRender()

    expect(
      await within(dialog).findByText("Couldn't check the code with Plex."),
    ).toBeInTheDocument()
  })

  it('unlinks the account through its confirm', async () => {
    const user = userEvent.setup()
    const calls = mockEndpoints()
    renderPage()
    const account = await findSection('Plex account')

    await user.click(account.getByRole('button', { name: 'Unlink' }))
    const dialog = await screen.findByRole('dialog', {
      name: 'Unlink Plex account',
    })
    await user.click(
      within(dialog).getByRole('button', { name: 'Unlink account' }),
    )

    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    )
    expect(calls.config).toEqual([{ plexTokens: [] }])
    expect(await accountPill()).toHaveTextContent('Not linked')
  })

  it.each([
    ['empty', ''],
    ['missing', undefined],
  ])('reads a %s address as Automatic', async (_name, plexServerUrl) => {
    mockEndpoints({ config: { ...LINKED, plexServerUrl } })
    renderPage()
    const card = await findSection('Plex server')

    expect(card.getByRole('button', { name: 'Automatic' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(card.queryByLabelText('Server address')).not.toBeInTheDocument()
  })

  it('saves Automatic as an empty address and tests the connection', async () => {
    const user = userEvent.setup()
    const calls = mockEndpoints({
      config: { ...LINKED, plexServerUrl: 'http://10.0.0.2:32400' },
    })
    renderPage()
    const card = await findSection('Plex server')
    expect(card.getByLabelText('Server address')).toHaveValue(
      'http://10.0.0.2:32400',
    )

    await user.click(card.getByRole('button', { name: 'Automatic' }))
    expect(card.getByRole('button', { name: 'Test connection' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() =>
      expect(calls.config).toEqual([
        {
          plexServerUrl: '',
          skipIfExistsOnPlex: true,
          plexExistenceScope: 'owned-and-shared',
        },
      ]),
    )
    expect(
      await card.findByText(
        `Automatic connection to ${REACHED.url}`,
        {},
        { timeout: 3000 },
      ),
    ).toBeInTheDocument()
    expect(calls.connectionTest).toBe(1)
    expect(calls.steps.map((entry) => entry.step)).not.toContain('ping')
  })

  it('reads a saved localhost address as an address', async () => {
    mockEndpoints({
      config: { ...LINKED, plexServerUrl: 'http://localhost:32400' },
    })
    renderPage()
    const card = await findSection('Plex server')

    expect(card.getByLabelText('Server address')).toHaveValue(
      'http://localhost:32400',
    )
  })

  it('shows why Test connection could not reach the server', async () => {
    const user = userEvent.setup()
    const calls = mockEndpoints({
      config: { ...LINKED, plexServerUrl: 'http://10.0.0.2:32400' },
      connectionTest: {
        success: false,
        message: "Couldn't reach the Plex server at this address.",
        url: 'http://10.0.0.2:32400',
        automatic: false,
      },
    })
    renderPage()
    const card = await findSection('Plex server')

    await user.click(card.getByRole('button', { name: 'Test connection' }))

    expect(
      await card.findByText(
        "Couldn't reach the Plex server at this address.",
        {},
        {
          timeout: 3000,
        },
      ),
    ).toBeInTheDocument()
    expect(card.getByText('http://10.0.0.2:32400')).toBeInTheDocument()
    expect(calls.connectionTest).toBe(1)
  })

  it('saves a typed address', async () => {
    const user = userEvent.setup()
    const calls = mockEndpoints()
    renderPage()
    const card = await findSection('Plex server')

    await user.click(card.getByRole('button', { name: 'Address' }))
    await user.type(card.getByLabelText('Server address'), 'plex.lan')
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled()
    await user.clear(card.getByLabelText('Server address'))
    await user.type(
      card.getByLabelText('Server address'),
      'https://plex.lan:32400',
    )
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() =>
      expect(calls.config).toEqual([
        {
          plexServerUrl: 'https://plex.lan:32400',
          skipIfExistsOnPlex: true,
          plexExistenceScope: 'owned-and-shared',
        },
      ]),
    )
  })

  it('saves the servers the existence check covers, only while it is on', async () => {
    const user = userEvent.setup()
    const calls = mockEndpoints()
    renderPage()
    const card = await findSection('Plex server')
    const ownedOnly = card.getByRole('button', { name: 'Your server' })

    await user.click(ownedOnly)
    expect(ownedOnly).toHaveAttribute('aria-pressed', 'true')
    await user.click(
      card.getByRole('switch', { name: 'Skip content already on Plex' }),
    )
    expect(ownedOnly).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() =>
      expect(calls.config).toEqual([
        {
          plexServerUrl: '',
          skipIfExistsOnPlex: false,
          plexExistenceScope: 'owned',
        },
      ]),
    )
  })

  it('fills the address from a server Plex offers', async () => {
    const user = userEvent.setup()
    const calls = mockEndpoints()
    renderPage()
    const card = await findSection('Plex server')

    await user.click(card.getByRole('button', { name: 'Address' }))
    await user.click(card.getByRole('button', { name: 'Find server' }))
    const offered = await card.findByRole('radiogroup', {
      name: 'Connections Plex offers',
    })
    const [working, unreachable] = within(offered).getAllByRole('radio')
    expect(working).toBeChecked()
    expect(card.getByLabelText('Server address')).toHaveValue(
      'https://192.168.1.100:32400',
    )
    expect(within(offered).getAllByText("Couldn't connect")).toHaveLength(1)

    await user.click(unreachable as HTMLElement)

    expect(card.getByLabelText('Server address')).toHaveValue(
      'http://73.42.118.9:32400',
    )
    expect(calls.discover).toEqual([TOKEN])
  })

  it('sets up library refresh without a host or token', async () => {
    const user = userEvent.setup()
    const calls = mockEndpoints()
    renderPage()
    const card = await findSection('Plex library refresh')
    await card.findByRole('table', { name: 'Library refresh by instance' })

    await user.click(card.getByRole('button', { name: 'Set up' }))

    expect(
      await card.findByText(
        'connect ECONNREFUSED 10.0.0.4',
        {},
        { timeout: 3000 },
      ),
    ).toBeInTheDocument()
    expect(calls.setup).toEqual([{}])
    const table = card.getByRole('table', {
      name: 'Library refresh by instance',
    })
    const rows = within(table).getAllByRole('row').slice(1)
    expect(rows.map((row) => row.textContent)).toEqual([
      'RadarrRadarrRadarrSet up',
      'Radarr 4KRadarrconnect ECONNREFUSED 10.0.0.4RadarrFailed',
      'SonarrSonarrSonarrSet up',
    ])
  })

  it('removes library refresh through its confirm', async () => {
    const user = userEvent.setup()
    const calls = mockEndpoints()
    renderPage()
    const card = await findSection('Plex library refresh')
    await card.findByRole('table', { name: 'Library refresh by instance' })

    await user.click(card.getByRole('button', { name: 'Remove' }))
    const dialog = await screen.findByRole('dialog', {
      name: 'Remove library refresh from 1 instance',
    })
    expect(within(dialog).getAllByRole('listitem')).toHaveLength(1)
    await user.click(
      within(dialog).getByRole('button', { name: 'Remove from 1 instance' }),
    )

    await waitFor(() => expect(calls.removed).toBe(1), { timeout: 3000 })
  })

  it('keeps the refresh table and reports a failed refetch beside it', async () => {
    mockEndpoints()
    renderPage()
    const card = await findSection('Plex library refresh')
    await card.findByRole('table', { name: 'Library refresh by instance' })

    server.use(http.get('/v1/plex/notification-status', serverError))
    await refetchAndRender(plexConnectionKeys.notificationStatus)

    expect(
      card.getByRole('table', { name: 'Library refresh by instance' }),
    ).toBeInTheDocument()
    expect(await card.findByText('Down')).toBeInTheDocument()
    expect(card.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })

  it('points to Sonarr and Radarr when there are no instances', async () => {
    mockEndpoints({ instances: false })
    renderPage()
    const card = await findSection('Plex library refresh')

    expect(card.getByRole('button', { name: 'Sonarr' })).toHaveAttribute(
      'href',
      '/library/sonarr',
    )
    expect(card.getByRole('button', { name: 'Radarr' })).toHaveAttribute(
      'href',
      '/library/radarr',
    )
    expect(card.queryByRole('button', { name: 'Set up' })).toBeNull()
  })

  it('locks the server and refresh cards until an account is linked', async () => {
    mockEndpoints({ config: NOT_LINKED })
    renderPage()
    const serverCard = await findSection('Plex server')
    const refresh = await findSection('Plex library refresh')

    expect(
      serverCard.getByRole('button', { name: 'Automatic' }),
    ).toHaveAttribute('aria-disabled', 'true')
    expect(serverCard.getByRole('switch')).toHaveAttribute(
      'aria-disabled',
      'true',
    )
    expect(
      serverCard.getByRole('button', { name: 'Test connection' }),
    ).toBeDisabled()
    expect(refresh.getByRole('button', { name: 'Set up' })).toBeDisabled()
    expect(refresh.getByRole('button', { name: 'Remove' })).toBeDisabled()
  })

  it('shows the page skeleton while loading', async () => {
    mockEndpoints()
    server.use(http.get('/v1/users/list/with-counts', () => delay('infinite')))
    renderPage()

    await waitFor(() =>
      expect(document.querySelector('[aria-busy="true"]')).toBeInTheDocument(),
    )
    expect(
      document.querySelectorAll('[data-slot="card"]').length,
    ).toBeGreaterThanOrEqual(3)
    expect(
      screen.queryByRole('heading', { name: 'Plex connection' }),
    ).not.toBeInTheDocument()
  })

  it('shows the retry alert when the page fails to load', async () => {
    const user = userEvent.setup()
    mockEndpoints()
    server.use(
      http.get('/v1/users/list/with-counts', () =>
        HttpResponse.json({}, { status: 500 }),
      ),
    )
    renderPage()

    expect(
      await screen.findByRole('alert', {}, { timeout: 3000 }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'Plex connection' }),
    ).toBeInTheDocument()
    mockEndpoints()
    await user.click(screen.getByRole('button', { name: 'Retry' }))

    expect(await accountPill()).toHaveTextContent('Linked')
  })
})
