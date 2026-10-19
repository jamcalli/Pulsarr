import {
  placeholderRadarrInstance,
  placeholderSonarrInstance,
} from '@root/schemas/common/arr-placeholder'
import type { ProgressEvent } from '@root/types/progress.types'
import { QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { delay, HttpResponse, http } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import SetupDialog from '@/features/setup'
import { setFormatLocale } from '@/lib/format'
import { markDone, type SyncRun, startRun } from '@/lib/plex/sync-run'
import { plexConnectionKeys } from '@/lib/query-keys'
import { queryClient } from '@/lib/queryClient'
import { useProgressStore } from '@/stores/progressStore'
import { useSetupStore } from '@/stores/setupStore'
import type { components } from '@/types/api.js'
import { server } from '../../setup.js'
import { stubViewport } from '../../viewport.js'

type ConfigUpdate = components['schemas']['ConfigUpdatePayload']
type SonarrInstance = components['schemas']['SonarrInstance']
type TestResponse = components['schemas']['ArrTestConnectionResponse']
type UserWithCount = components['schemas']['UserWithCount']

const TOKEN = 'pasted-token-41ab'
const RUN_TIMEOUT = { timeout: 6000 }

const NOT_LINKED: ConfigUpdate = {
  plexTokens: [],
  plexServerUrl: '',
  skipIfExistsOnPlex: true,
  _isReady: false,
}
const LINKED: ConfigUpdate = { ...NOT_LINKED, plexTokens: ['linked-token'] }

const sonarr: SonarrInstance = {
  id: 1,
  name: 'Sonarr',
  baseUrl: 'http://192.168.1.20:8989',
  apiKey: 'key-1',
  qualityProfile: 4,
  rootFolder: '/data/tv',
  bypassIgnored: false,
  seasonMonitoring: 'all',
  monitorNewItems: 'all',
  searchOnAdd: true,
  createSeasonFolders: false,
  tags: [],
  isDefault: true,
  syncedInstances: [],
  seriesType: 'standard',
  skipDefaultRoutingWhenNoMatch: false,
}
const sonarrPlaceholder: SonarrInstance = {
  ...sonarr,
  ...placeholderSonarrInstance(),
  id: 7,
}
const radarrPlaceholder = { ...placeholderRadarrInstance(), id: 8 }

function syncedUser(
  id: number,
  isOwner: boolean,
  watchlistCount: number,
): UserWithCount {
  return {
    id,
    name: isOwner ? 'owner' : `friend-${id}`,
    apprise: null,
    alias: null,
    discord_id: null,
    notify_apprise: false,
    notify_discord: false,
    notify_discord_mention: false,
    notify_plex_mobile: false,
    can_sync: true,
    requires_approval: false,
    is_primary_token: isOwner,
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
    friendStatus: null,
    pendingSince: null,
    watchlist_count: watchlistCount,
  }
}

const ONBOARDED_USERS = [
  syncedUser(1, true, 214),
  syncedUser(2, false, 30),
  syncedUser(3, false, 12),
]

const PASSED: TestResponse = {
  success: true,
  message: 'Connection successful',
  code: null,
}

type Recorded = 'self' | 'friends' | 'start'

type WatchlistSyncType = 'self-watchlist' | 'others-watchlist'
type SyncStatus = components['schemas']['WatchlistSyncStatus']

const SYNC_STEPS: Record<WatchlistSyncType, Recorded> = {
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

const IDLE_SYNC: SyncStatus = {
  state: 'idle',
  startedAt: null,
  finishedAt: null,
  error: null,
  total: null,
  friends: null,
}

function emit(event: ProgressEvent) {
  for (const callback of useProgressStore
    .getState()
    .typeSubscribers.get(event.type) ?? []) {
    callback(event)
  }
}

function setWorkflowStatus(status: 'running' | 'stopped') {
  const event: ProgressEvent = {
    operationId: 'watchlist-workflow-status',
    type: 'system',
    phase: 'info',
    progress: 100,
    message: 'Watchlist workflow status',
    metadata: { status, syncMode: 'rss', rssAvailable: true, lastError: null },
  }
  useProgressStore.setState((state) => ({
    systemStatusCache: {
      ...state.systemStatusCache,
      'watchlist-workflow-status': event,
    },
  }))
}

function mockEndpoints({
  config = LINKED,
  sonarrInstances = [sonarrPlaceholder],
  fail = [],
  users = [],
}: {
  config?: ConfigUpdate
  sonarrInstances?: SonarrInstance[]
  fail?: Recorded[]
  users?: UserWithCount[]
} = {}) {
  let saved: ConfigUpdate = { ...config }
  let instances = [...sonarrInstances]
  const calls = {
    configLoads: 0,
    config: [] as ConfigUpdate[],
    put: [] as Array<{ id: string; body: Partial<SonarrInstance> }>,
    requests: [] as Recorded[],
    start: [] as unknown[],
  }
  const syncs: Record<WatchlistSyncType, SyncStatus> = {
    'self-watchlist': IDLE_SYNC,
    'others-watchlist': IDLE_SYNC,
  }
  const runSync = async (type: WatchlistSyncType) => {
    const name = SYNC_STEPS[type]
    calls.requests.push(name)
    syncs[type] = {
      ...IDLE_SYNC,
      state: 'running',
      startedAt: new Date().toISOString(),
    }
    await delay(30)
    const finishedAt = new Date().toISOString()
    const failed = fail.includes(name)
    syncs[type] = failed
      ? {
          ...syncs[type],
          state: 'failed',
          finishedAt,
          error: `${name} failed upstream`,
        }
      : { ...syncs[type], state: 'done', finishedAt, ...SYNC_COUNTS[type] }
    emit({
      operationId: `${type}-sync`,
      type,
      phase: failed ? 'failed' : 'complete',
      progress: 100,
      message: failed ? 'failed' : 'complete',
      metadata: { stage: failed ? 'failed' : 'complete', count: null },
    })
  }
  server.use(
    http.get('/v1/config', () => {
      calls.configLoads += 1
      return HttpResponse.json({ success: true, config: saved })
    }),
    http.put<never, ConfigUpdate>('/v1/config', async ({ request }) => {
      const body = await request.json()
      calls.config.push(body)
      saved = { ...saved, ...body }
      return HttpResponse.json({ success: true, config: saved })
    }),
    http.get('/v1/sonarr/instances', () => HttpResponse.json(instances)),
    http.get('/v1/radarr/instances', () =>
      HttpResponse.json([radarrPlaceholder]),
    ),
    http.put<{ id: string }, Partial<SonarrInstance>>(
      '/v1/sonarr/instances/:id',
      async ({ request, params }) => {
        const body = await request.json()
        calls.put.push({ id: params.id, body })
        instances = instances.map((instance) =>
          String(instance.id) === params.id
            ? { ...instance, ...body }
            : instance,
        )
        return new HttpResponse(null, { status: 204 })
      },
    ),
    http.post('/v1/sonarr/test-connection', () =>
      HttpResponse.json<TestResponse>(PASSED),
    ),
    http.post('/v1/sonarr/probe', () =>
      HttpResponse.json({
        success: true,
        qualityProfiles: [{ id: 4, name: 'HD-1080p' }],
        rootFolders: [{ id: 1, path: '/data/tv' }],
        tags: [],
      }),
    ),
    http.post('/v1/plex/pin', () =>
      HttpResponse.json({
        id: 1,
        code: 'K7Q1',
        qr: 'https://plex.tv/qr.png',
        expiresAt: '2026-10-14T14:28:00Z',
        clientId: 'client-1',
      }),
    ),
    http.get('/v1/plex/pin/:pinId', () =>
      HttpResponse.json({ authToken: null, expiresIn: 600 }),
    ),
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
    http.get('/v1/plex/plex-pass-status', () =>
      HttpResponse.json({ hasPlexPass: false }),
    ),
    http.get('/v1/users/list/with-counts', () =>
      HttpResponse.json({ success: true, message: 'ok', users }),
    ),
    http.post(
      '/v1/watchlist-workflow/start-background',
      async ({ request }) => {
        calls.start.push(await request.json())
        calls.requests.push('start')
        return HttpResponse.json({ message: 'started' }, { status: 202 })
      },
    ),
  )
  return calls
}

function renderDialog() {
  const router = createMemoryRouter([{ path: '*', element: <SetupDialog /> }], {
    initialEntries: ['/'],
  })
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

async function chooseOption(label: string, option: string) {
  const user = userEvent.setup()
  await user.click(screen.getByLabelText(label))
  await user.click(await screen.findByRole('option', { name: option }))
}

function stepNav() {
  return within(screen.getByRole('navigation', { name: 'Setup steps' }))
}

async function findStep(name: string, options?: { timeout: number }) {
  const dialog = await screen.findByRole('dialog', { name: 'Set up Pulsarr' })
  await within(dialog).findByRole('heading', { name }, options)
  return dialog
}

describe('SetupDialog', () => {
  beforeEach(() => {
    setFormatLocale('en-US')
    stubViewport({ mobile: false })
    // keeps subscribers from opening the progress EventSource
    useProgressStore.setState({
      isConnecting: true,
      systemStatusCache: {},
      watchlistSyncCache: {},
    })
  })

  afterEach(() => {
    queryClient.clear()
    useSetupStore.setState({ requested: false })
    setFormatLocale(undefined)
    vi.unstubAllGlobals()
  })

  it('opens on the Plex account without a token and cannot be closed', async () => {
    const user = userEvent.setup()
    mockEndpoints({ config: NOT_LINKED })
    renderDialog()

    const dialog = await findStep('Plex account')
    await user.keyboard('{Escape}')
    const backdrop = document.querySelector('[data-slot="dialog-overlay"]')
    if (!(backdrop instanceof HTMLElement)) throw new Error('No backdrop')
    await user.click(backdrop)

    expect(screen.getByRole('dialog', { name: 'Set up Pulsarr' })).toBe(dialog)
    expect(stepNav().getByRole('tab', { name: 'Sonarr' })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
    const buttons = within(dialog)
    expect(buttons.queryByRole('button', { name: 'Skip for now' })).toBeNull()
    expect(buttons.queryByRole('button', { name: 'Back' })).toBeNull()
    expect(buttons.queryByRole('button', { name: 'Close' })).toBeNull()
    expect(buttons.getByRole('button', { name: 'Continue' })).toBeDisabled()
  })

  it('links a pasted token and moves to the server without syncing', async () => {
    const user = userEvent.setup()
    const calls = mockEndpoints({ config: NOT_LINKED })
    renderDialog()

    const dialog = await findStep('Plex account')
    await user.click(within(dialog).getByRole('tab', { name: 'Paste a token' }))
    await user.type(within(dialog).getByLabelText('Plex token'), TOKEN)
    await user.click(
      within(dialog).getByRole('button', { name: 'Link account' }),
    )

    expect(await findStep('Plex server')).toBeInTheDocument()
    expect(calls.config).toEqual([{ plexTokens: [TOKEN] }])
    expect(calls.requests).toEqual([])
  })

  it('hides a failed token save once the token is edited', async () => {
    const user = userEvent.setup()
    mockEndpoints({ config: NOT_LINKED })
    server.use(
      http.put('/v1/config', () =>
        HttpResponse.json(
          {
            statusCode: 500,
            error: 'Internal Server Error',
            message: 'Config write failed',
          },
          { status: 500 },
        ),
      ),
    )
    renderDialog()

    const dialog = await findStep('Plex account')
    await user.click(within(dialog).getByRole('tab', { name: 'Paste a token' }))
    const field = within(dialog).getByLabelText('Plex token')
    await user.type(field, TOKEN)
    await user.click(
      within(dialog).getByRole('button', { name: 'Link account' }),
    )

    expect(
      await within(dialog).findByText('Config write failed'),
    ).toBeInTheDocument()
    await user.click(field)
    await user.keyboard('x')
    expect(within(dialog).queryByText('Config write failed')).toBeNull()
  })

  it('opens on Sonarr with a retry when its instances fail to load', async () => {
    mockEndpoints()
    server.use(
      http.get('/v1/sonarr/instances', () =>
        HttpResponse.json({}, { status: 500 }),
      ),
    )
    renderDialog()
    act(() => useSetupStore.getState().request())

    const dialog = await findStep('Sonarr', RUN_TIMEOUT)
    expect(
      await within(dialog).findByRole('button', { name: 'Retry' }),
    ).toBeInTheDocument()
  })

  it('continues past a clean server without saving it', async () => {
    const user = userEvent.setup()
    const calls = mockEndpoints()
    renderDialog()
    act(() => useSetupStore.getState().request())

    const dialog = await findStep('Sonarr')
    await user.click(within(dialog).getByRole('button', { name: 'Back' }))
    await findStep('Plex server')
    await user.click(within(dialog).getByRole('button', { name: 'Continue' }))

    expect(await findStep('Sonarr')).toBeInTheDocument()
    expect(calls.config).toEqual([])
  })

  it('offers Skip on the server step only once it is dirty', async () => {
    const user = userEvent.setup()
    mockEndpoints()
    renderDialog()
    act(() => useSetupStore.getState().request())

    const dialog = await findStep('Sonarr')
    await user.click(within(dialog).getByRole('button', { name: 'Back' }))
    await findStep('Plex server')
    expect(
      within(dialog).queryByRole('button', { name: 'Skip for now' }),
    ).toBeNull()

    await user.click(
      within(dialog).getByRole('switch', {
        name: 'Skip content already on Plex',
      }),
    )

    expect(
      within(dialog).getByRole('button', { name: 'Skip for now' }),
    ).toBeInTheDocument()
    expect(
      within(dialog).getByRole('button', { name: 'Save and continue' }),
    ).toBeInTheDocument()
  })

  it('asks before leaving a dirty step and stays on Stay', async () => {
    const user = userEvent.setup()
    const calls = mockEndpoints()
    renderDialog()
    act(() => useSetupStore.getState().request())

    const sonarrStep = await findStep('Sonarr')
    await user.type(await screen.findByLabelText('Name'), 'Sonarr')
    await user.click(within(sonarrStep).getByRole('button', { name: 'Back' }))

    const leave = await screen.findByRole('dialog', {
      name: 'Leave without saving?',
    })
    await user.click(within(leave).getByRole('button', { name: 'Stay' }))
    expect(
      within(sonarrStep).getByRole('heading', { name: 'Sonarr' }),
    ).toBeInTheDocument()

    await user.click(
      within(sonarrStep).getByRole('button', { name: 'Skip for now' }),
    )
    await user.click(
      within(
        await screen.findByRole('dialog', {
          name: 'Leave without saving?',
        }),
      ).getByRole('button', { name: 'Leave' }),
    )

    expect(await findStep('Radarr')).toBeInTheDocument()
    expect(calls.put).toEqual([])
  })

  it('adds the first Sonarr instance over the placeholder and moves to Radarr', async () => {
    const user = userEvent.setup()
    const calls = mockEndpoints()
    renderDialog()
    act(() => useSetupStore.getState().request())

    await findStep('Sonarr')
    await user.type(await screen.findByLabelText('Name'), 'Sonarr')
    await user.type(screen.getByLabelText('URL'), sonarr.baseUrl)
    await user.type(screen.getByLabelText('API key'), 'key-1')
    await user.click(screen.getByRole('button', { name: 'Test connection' }))
    await waitFor(() =>
      expect(screen.getByLabelText('Quality profile')).toBeEnabled(),
    )
    await chooseOption('Quality profile', 'HD-1080p')
    await chooseOption('Root folder', '/data/tv')
    await user.click(screen.getByRole('button', { name: 'Save and continue' }))

    expect(await findStep('Radarr')).toBeInTheDocument()
    expect(calls.put).toHaveLength(1)
    expect(calls.put[0]).toMatchObject({
      id: '7',
      body: { name: 'Sonarr', apiKey: 'key-1', isDefault: true },
    })
  })

  it('lists a saved Sonarr instance and continues past it', async () => {
    const user = userEvent.setup()
    mockEndpoints({ sonarrInstances: [sonarr] })
    renderDialog()
    act(() => useSetupStore.getState().request())

    await findStep('Start syncing')
    await user.click(stepNav().getByRole('tab', { name: 'Sonarr done' }))
    const dialog = await findStep('Sonarr')
    const list = within(dialog).getByRole('list', { name: 'Instances' })
    expect(within(list).getByText(sonarr.baseUrl)).toBeInTheDocument()
    expect(within(list).getByText('Default')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Continue' }))

    expect(await findStep('Radarr')).toBeInTheDocument()
  })

  it('syncs both watchlists, then closes as the workflow starts in the background', async () => {
    const user = userEvent.setup()
    const calls = mockEndpoints({ sonarrInstances: [sonarr] })
    renderDialog()
    act(() => useSetupStore.getState().request())

    const dialog = await findStep('Start syncing')
    await user.click(
      within(dialog).getByRole('button', { name: 'Sync watchlists' }),
    )

    const startButton = await within(dialog).findByRole(
      'button',
      { name: 'Start workflow' },
      RUN_TIMEOUT,
    )
    expect(calls.requests.toSorted()).toEqual(['friends', 'self'])
    expect(calls.start).toEqual([])
    expect(
      within(dialog).getByRole('switch', { name: 'Start on launch' }),
    ).toBeChecked()
    expect(
      within(dialog).queryByRole('button', { name: 'Sync watchlists' }),
    ).toBeNull()

    await user.click(startButton)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(calls.start).toEqual([{ autoStart: true }])
    expect(useSetupStore.getState().requested).toBe(false)
  })

  it('starts without auto-start when Start on launch is off', async () => {
    const user = userEvent.setup()
    const calls = mockEndpoints({ sonarrInstances: [sonarr] })
    renderDialog()
    act(() => useSetupStore.getState().request())

    const dialog = await findStep('Start syncing')
    await user.click(
      within(dialog).getByRole('button', { name: 'Sync watchlists' }),
    )
    const startButton = await within(dialog).findByRole(
      'button',
      { name: 'Start workflow' },
      RUN_TIMEOUT,
    )
    await user.click(
      within(dialog).getByRole('switch', { name: 'Start on launch' }),
    )
    await user.click(startButton)

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(calls.start).toEqual([{ autoStart: false }])
  })

  it('reads friends even when the owner sync fails, then offers a retry', async () => {
    const user = userEvent.setup()
    const calls = mockEndpoints({ sonarrInstances: [sonarr], fail: ['self'] })
    renderDialog()
    act(() => useSetupStore.getState().request())

    const dialog = await findStep('Start syncing')
    await user.click(
      within(dialog).getByRole('button', { name: 'Sync watchlists' }),
    )

    expect(
      await within(dialog).findByRole('button', { name: 'Retry' }, RUN_TIMEOUT),
    ).toBeEnabled()
    expect(within(dialog).getByText('self failed upstream')).toBeInTheDocument()
    expect(calls.requests.toSorted()).toEqual(['friends', 'self'])
    expect(
      within(dialog).queryByRole('button', { name: 'Start workflow' }),
    ).toBeNull()
  })

  it('picks the running sync back up after the dialog closes and reopens', async () => {
    const user = userEvent.setup()
    const calls = mockEndpoints({ sonarrInstances: [sonarr] })
    renderDialog()
    act(() => useSetupStore.getState().request())

    const dialog = await findStep('Start syncing')
    await user.click(
      within(dialog).getByRole('button', { name: 'Sync watchlists' }),
    )
    act(() => useSetupStore.getState().dismiss())
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    act(() => useSetupStore.getState().request())
    const reopened = await findStep('Start syncing')
    await user.click(stepNav().getByRole('tab', { name: 'Start syncing' }))

    expect(
      await within(reopened).findByRole(
        'button',
        { name: 'Start workflow' },
        RUN_TIMEOUT,
      ),
    ).toBeEnabled()
    expect(
      within(reopened).queryByRole('button', { name: 'Sync watchlists' }),
    ).toBeNull()
    expect(calls.requests.toSorted()).toEqual(['friends', 'self'])
  })

  it('closes on Explore settings first without starting the workflow', async () => {
    const user = userEvent.setup()
    const calls = mockEndpoints({ sonarrInstances: [sonarr] })
    renderDialog()
    act(() => useSetupStore.getState().request())

    const dialog = await findStep('Start syncing')
    await user.click(
      within(dialog).getByRole('button', { name: 'Sync watchlists' }),
    )
    await user.click(
      await within(dialog).findByRole(
        'button',
        { name: 'Explore settings first' },
        RUN_TIMEOUT,
      ),
    )

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(calls.start).toEqual([])
    expect(calls.requests).not.toContain('start')
  })

  it('shows a sync the server is already running and locks Sync watchlists', async () => {
    mockEndpoints({ sonarrInstances: [sonarr] })
    useProgressStore.setState({
      watchlistSyncCache: {
        'others-watchlist': {
          operationId: 'others-watchlist-sync',
          type: 'others-watchlist',
          phase: 'reading',
          progress: 35,
          message: 'Alice page 3, Bob page 1',
          metadata: {
            stage: 'reading',
            count: { done: 4, total: 12, unit: 'friends' },
          },
        },
      },
    })
    renderDialog()
    act(() => useSetupStore.getState().request())

    const dialog = await findStep('Start syncing')
    const steps = within(dialog).getByRole('list', { name: 'Sync steps' })
    expect(
      within(steps).getByText('Alice page 3, Bob page 1'),
    ).toBeInTheDocument()
    expect(within(steps).getByRole('progressbar')).toHaveAttribute(
      'aria-valuenow',
      '35',
    )
    expect(
      within(dialog).queryByRole('button', { name: 'Sync watchlists' }),
    ).toBeDisabled()
  })

  it('offers Start workflow without a first sync once the owner is onboarded', async () => {
    const user = userEvent.setup()
    const calls = mockEndpoints({
      sonarrInstances: [sonarr],
      users: ONBOARDED_USERS,
    })
    setWorkflowStatus('stopped')
    renderDialog()
    act(() => useSetupStore.getState().request())

    const dialog = await findStep('Start syncing')
    const startButton = await within(dialog).findByRole('button', {
      name: 'Start workflow',
    })
    expect(startButton).toBeEnabled()
    expect(within(dialog).getByText('214 items')).toBeInTheDocument()
    expect(within(dialog).getByText('2 friends, 42 items')).toBeInTheDocument()
    expect(
      within(dialog).getByRole('switch', { name: 'Start on launch' }),
    ).toBeChecked()

    await user.click(startButton)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(calls.start).toEqual([{ autoStart: true }])
    expect(calls.requests).toEqual(['start'])
  })

  it('shows only Done when the workflow already runs', async () => {
    const user = userEvent.setup()
    const calls = mockEndpoints({
      config: { ...LINKED, _isReady: true },
      sonarrInstances: [sonarr],
    })
    setWorkflowStatus('running')
    renderDialog()
    act(() => useSetupStore.getState().request())

    const dialog = await findStep('Plex account')
    await user.click(stepNav().getByRole('tab', { name: 'Start syncing done' }))
    await findStep('Start syncing')

    expect(within(dialog).getByText('Syncing is on.')).toBeInTheDocument()
    expect(
      within(dialog).queryByRole('button', { name: 'Sync watchlists' }),
    ).toBeNull()
    await user.click(within(dialog).getByRole('button', { name: 'Done' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(calls.requests).toEqual([])
  })

  it('shows only Done when the workflow runs after a finished link run', async () => {
    const user = userEvent.setup()
    mockEndpoints({
      config: { ...LINKED, _isReady: true },
      sonarrInstances: [sonarr],
    })
    setWorkflowStatus('running')
    const linked = (['self', 'friends', 'feeds'] as const).reduce(
      (run, id) => markDone(run, id, null),
      startRun('link'),
    )
    queryClient.setQueryData<SyncRun>(plexConnectionKeys.syncRun, {
      ...linked,
      ranAt: Date.now(),
    })
    renderDialog()
    act(() => useSetupStore.getState().request())

    const dialog = await findStep('Plex account')
    await user.click(stepNav().getByRole('tab', { name: 'Start syncing done' }))
    await findStep('Start syncing')

    expect(within(dialog).getByText('Syncing is on.')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Done' })).toBeEnabled()
    expect(
      within(dialog).queryByRole('button', { name: 'Start workflow' }),
    ).toBeNull()
  })

  it('stays closed for a linked install until the account menu asks for it', async () => {
    const calls = mockEndpoints()
    renderDialog()

    await waitFor(() => expect(calls.configLoads).toBeGreaterThan(0))
    await act(() => delay(50))
    expect(screen.queryByRole('dialog')).toBeNull()

    act(() => useSetupStore.getState().request())

    expect(await findStep('Sonarr')).toBeInTheDocument()
  })
})
