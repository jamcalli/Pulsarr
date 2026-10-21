import { PLEX_SESSION_MONITORING_DEFAULTS } from '@root/schemas/session-monitoring/session-monitoring-config.schema'
import { QueryClientProvider } from '@tanstack/react-query'
import {
  act,
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { delay, HttpResponse, http } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import SessionMonitoringPage from '@/features/library/pages/session-monitoring'
import { configKeys } from '@/hooks/useConfig'
import { setFormatLocale } from '@/lib/format'
import { sessionMonitoringKeys } from '@/lib/query-keys'
import { queryClient } from '@/lib/queryClient'
import { useProgressStore } from '@/stores/progressStore'
import type { components } from '@/types/api.js'
import { refetchAndRender, serverError } from '../../../refetch.js'
import { server } from '../../../setup.js'
import { stubViewport } from '../../../viewport.js'

type RollingRecord = components['schemas']['RollingMonitoredShow']
type EnrollableShow = components['schemas']['SonarrShowWithEnrollment']
type SonarrInstance = components['schemas']['SonarrInstance']
type MonitoringConfig = components['schemas']['PlexSessionMonitoringConfig']
type ConfigUpdate = components['schemas']['ConfigUpdatePayload']
type CheckResult = components['schemas']['SessionMonitoringResult']
type BulkPayload = components['schemas']['BulkManageRollingPayload']
type ResetInactivePayload =
  components['schemas']['SessionMonitoringResetInactivePayload']

const SAVED: Required<MonitoringConfig> = {
  ...PLEX_SESSION_MONITORING_DEFAULTS,
  enabled: true,
  inactivityResetDays: 14,
}

function record(overrides: Partial<RollingRecord>): RollingRecord {
  return {
    id: 1,
    sonarr_series_id: 10,
    show_title: 'Severance',
    monitoring_type: 'pilotRolling',
    current_monitored_season: 1,
    last_watched_season: 0,
    last_watched_episode: 0,
    last_session_date: null,
    sonarr_instance_id: 1,
    plex_user_id: null,
    plex_username: null,
    season_episode_counts: null,
    created_at: '2026-02-09T00:00:00Z',
    updated_at: '2026-02-09T00:00:00Z',
    last_updated_at: '2026-02-09T00:00:00Z',
    ...overrides,
  }
}

const severance = record({
  id: 1,
  sonarr_series_id: 10,
  sonarr_instance_id: 2,
  current_monitored_season: 2,
})
const reacher = record({
  id: 3,
  sonarr_series_id: 30,
  show_title: 'Reacher',
  monitoring_type: 'allSeasonPilotRolling',
  current_monitored_season: 0,
})
const bear = record({
  id: 5,
  sonarr_series_id: 50,
  show_title: 'The Bear',
  monitoring_type: 'firstSeasonRolling',
  current_monitored_season: 3,
})

const rolling: RollingRecord[] = [
  severance,
  record({
    id: 2,
    sonarr_series_id: 10,
    sonarr_instance_id: 2,
    plex_user_id: '11',
    plex_username: 'mayar88',
    last_watched_season: 2,
    last_watched_episode: 3,
    last_session_date: '2026-10-12T00:00:00Z',
  }),
  record({
    id: 4,
    sonarr_series_id: 10,
    sonarr_instance_id: 2,
    plex_user_id: '12',
    plex_username: 'lukas.admin',
    last_watched_season: 2,
    last_watched_episode: 7,
    last_session_date: '2026-10-13T00:00:00Z',
  }),
  reacher,
  bear,
  record({
    id: 6,
    sonarr_series_id: 50,
    plex_user_id: '13',
    plex_username: 'theo_watches',
    last_watched_season: 3,
    last_watched_episode: 4,
    last_session_date: '2026-09-01T00:00:00Z',
  }),
]

function sonarrInstance(id: number, name: string): SonarrInstance {
  return {
    id,
    name,
    baseUrl: `http://sonarr-${id}`,
    apiKey: `key-${id}`,
    bypassIgnored: false,
    seasonMonitoring: 'all',
    monitorNewItems: 'all',
    searchOnAdd: true,
    createSeasonFolders: true,
    tags: [],
    isDefault: id === 1,
    seriesType: 'standard',
    skipDefaultRoutingWhenNoMatch: false,
  }
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

function enrollable(overrides: Partial<EnrollableShow>): EnrollableShow {
  return {
    watchlistId: 1,
    sonarrInstanceId: 1,
    sonarrSeriesId: 100,
    title: 'Ted Lasso',
    guids: ['tvdb:383203'],
    rollingShowId: null,
    monitoringType: null,
    ...overrides,
  }
}

const enrollableShows: EnrollableShow[] = [
  enrollable({ watchlistId: 1, sonarrSeriesId: 100, title: 'Ted Lasso' }),
  enrollable({
    watchlistId: 2,
    sonarrSeriesId: 10,
    sonarrInstanceId: 2,
    title: 'Severance',
    rollingShowId: 1,
    monitoringType: 'pilotRolling',
  }),
  enrollable({ watchlistId: 3, sonarrSeriesId: 101, title: 'Barry' }),
]

const checkResult: CheckResult = {
  processedSessions: 3,
  triggeredSearches: 2,
  errors: ['Sonarr 4K did not respond within 30 seconds.'],
  rollingUpdates: [
    {
      showTitle: 'Severance',
      action: 'expanded_to_next_season',
      details: 'Season 3 requested.',
    },
  ],
}

const pagedEnrollable: EnrollableShow[] = Array.from(
  { length: 25 },
  (_, index) =>
    enrollable({
      watchlistId: index + 1,
      sonarrSeriesId: index + 1,
      title: `Show ${String(index + 1).padStart(2, '0')}`,
    }),
)

function mockEndpoints({
  saved = SAVED,
  shows = rolling,
  inactive = [bear],
  enrollableList = enrollableShows,
  bulkFailed = 0,
}: {
  saved?: Required<MonitoringConfig>
  shows?: RollingRecord[]
  inactive?: RollingRecord[]
  enrollableList?: EnrollableShow[]
  bulkFailed?: number
} = {}) {
  const calls = {
    inactiveDays: [] as Array<string | null>,
    config: [] as ConfigUpdate[],
    reset: [] as string[],
    stop: [] as string[],
    resetInactive: [] as ResetInactivePayload[],
    bulk: [] as BulkPayload[],
    runs: 0,
  }
  server.use(
    http.get('/v1/config', () =>
      HttpResponse.json({
        success: true,
        config: { plexSessionMonitoring: saved },
      }),
    ),
    http.put<never, ConfigUpdate>('/v1/config', async ({ request }) => {
      const body = await request.json()
      calls.config.push(body)
      return HttpResponse.json({
        success: true,
        config: { plexSessionMonitoring: saved, ...(body as object) },
      })
    }),
    http.get('/v1/session-monitoring/rolling-monitored', () =>
      HttpResponse.json({ success: true, shows }),
    ),
    http.get(
      '/v1/session-monitoring/rolling-monitored/inactive',
      ({ request }) => {
        const days = new URL(request.url).searchParams.get('inactivityDays')
        calls.inactiveDays.push(days)
        return HttpResponse.json({
          success: true,
          shows: inactive,
          inactivityDays: Number(days),
        })
      },
    ),
    http.post(
      '/v1/session-monitoring/rolling-monitored/:id/reset',
      ({ params }) => {
        calls.reset.push(String(params.id))
        return HttpResponse.json({ success: true, message: 'ok' })
      },
    ),
    http.delete(
      '/v1/session-monitoring/rolling-monitored/:id',
      ({ request }) => {
        calls.stop.push(request.url)
        return HttpResponse.json({ success: true, message: 'ok' })
      },
    ),
    http.post<never, ResetInactivePayload>(
      '/v1/session-monitoring/rolling-monitored/reset-inactive',
      async ({ request }) => {
        calls.resetInactive.push(await request.json())
        return HttpResponse.json({
          success: true,
          message: 'ok',
          resetCount: 1,
        })
      },
    ),
    http.post('/v1/session-monitoring/run', () => {
      calls.runs += 1
      return HttpResponse.json({ success: true, result: checkResult })
    }),
    http.get('/v1/session-monitoring/sonarr-shows', () =>
      HttpResponse.json({ success: true, shows: enrollableList }),
    ),
    http.post<never, BulkPayload>(
      '/v1/session-monitoring/rolling-monitored/bulk',
      async ({ request }) => {
        const body = await request.json()
        calls.bulk.push(body)
        return HttpResponse.json({
          success: true,
          message: 'ok',
          enrolled: body.shows.length - bulkFailed,
          modified: 0,
          skipped: 0,
          failed: bulkFailed,
        })
      },
    ),
    http.get('/v1/sonarr/instances', () =>
      HttpResponse.json([
        sonarrInstance(1, 'Sonarr'),
        sonarrInstance(2, 'Sonarr 4K'),
      ]),
    ),
    http.get('/v1/users/list', () =>
      HttpResponse.json({
        success: true,
        message: 'ok',
        users: [
          user(11, 'mayar88', 'Maya R.'),
          user(12, 'lukas.admin', 'Lukas'),
          user(13, 'theo_watches', null),
        ],
      }),
    ),
  )
  return calls
}

function renderPage(initialEntry = '/') {
  const router = createMemoryRouter(
    [{ path: '*', element: <SessionMonitoringPage /> }],
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
  return screen.findByRole('table', { name: 'Rolling shows' })
}

function showRows(table: HTMLElement) {
  return within(table)
    .getAllByRole('row')
    .slice(1)
    .filter((row) => within(row).queryAllByRole('cell').length > 1)
}

function showTitles(table: HTMLElement) {
  return showRows(table).map(
    (row) =>
      within(row).getAllByRole('cell')[0]?.firstChild?.firstChild?.textContent,
  )
}

function rowFor(table: HTMLElement, title: string) {
  const row = showRows(table).find((entry) => within(entry).queryByText(title))
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

async function openViewers(name: string) {
  const user = userEvent.setup()
  const table = await findTable()
  await user.click(within(table).getByRole('button', { name }))
  return { user, region: await screen.findByRole('region', { name }) }
}

describe('SessionMonitoringPage', () => {
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

  it('reads the live connection as connecting until the server reports', async () => {
    mockEndpoints()
    renderPage()
    const status = await findSection('Status')

    expect(status.getByRole('status')).toHaveTextContent('Connecting')

    act(() =>
      useProgressStore.setState({
        systemStatusCache: {
          'plex-sse-status': {
            operationId: 'plex-sse-status',
            type: 'system',
            phase: 'info',
            progress: 0,
            message: 'Plex SSE status',
            metadata: { status: 'disconnected' },
          },
        },
      }),
    )
    expect(status.getByRole('status')).toHaveTextContent('Polling')
  })

  it('lists one row per show with its viewers grouped under it', async () => {
    mockEndpoints()
    renderPage()

    const table = await findTable()
    expect(showTitles(table)).toEqual(['Severance', 'The Bear', 'Reacher'])
    const severanceRow = rowFor(table, 'Severance')
    expect(severanceRow.getByText('Sonarr 4K')).toBeInTheDocument()
    expect(severanceRow.getByText('2 viewers')).toBeInTheDocument()
    expect(
      rowFor(table, 'The Bear').getByText('theo_watches'),
    ).toBeInTheDocument()
  })

  it('shows each viewer of an expanded row, newest first', async () => {
    mockEndpoints()
    renderPage()

    const { region } = await openViewers('Severance viewers')
    const viewerRows = within(region).getAllByRole('row').slice(1)
    expect(
      viewerRows.map((row) => within(row).getAllByRole('cell')[0]?.textContent),
    ).toEqual(['Lukaslukas.admin', 'Maya R.mayar88'])
    expect(within(region).getByText('Season 2, episode 7')).toBeInTheDocument()
  })

  it('draws no track for a viewer whose season length is unknown', async () => {
    mockEndpoints()
    renderPage()

    const { region } = await openViewers('Severance viewers')
    expect(
      within(region).queryByRole('button', { name: /^Season / }),
    ).not.toBeInTheDocument()
  })

  it('tracks a viewer through the season up to the trigger', async () => {
    const trigger = 10 - SAVED.remainingEpisodes
    mockEndpoints({
      shows: rolling.map((show) =>
        show.id === severance.id
          ? { ...show, season_episode_counts: { 2: 10 } }
          : show,
      ),
    })
    renderPage()

    const { region } = await openViewers('Severance viewers')
    const bar = within(region).getByRole('button', {
      name: 'Season 2: Episode 7 of 10',
    })
    expect(bar.querySelector('[data-slot="stat-bar-fill"]')).toHaveStyle({
      width: '70%',
    })
    expect(
      bar.parentElement?.querySelector('[data-slot="stat-bar-marker"]'),
    ).toHaveStyle({ left: `calc(${trigger * 10}% - 1px)` })
    expect(
      within(region).getAllByText(`Next season grabs at episode ${trigger}`),
    ).toHaveLength(2)
  })

  it('reads Pilots only for an all season pilot show at season 0', async () => {
    mockEndpoints()
    renderPage()

    const table = await findTable()
    expect(
      rowFor(table, 'Reacher').getByText('Pilots only'),
    ).toBeInTheDocument()
    expect(rowFor(table, 'Severance').getByText('Season 2')).toBeInTheDocument()
  })

  it('takes Inactive and the reset count from the inactive endpoint with the saved days', async () => {
    const calls = mockEndpoints()
    renderPage()

    const table = await findTable()
    expect(calls.inactiveDays).toEqual(['14'])
    expect(rowFor(table, 'The Bear').getByText('Inactive')).toBeInTheDocument()
    expect(
      rowFor(table, 'Severance').queryByText('Inactive'),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Reset 1 inactive' }),
    ).toBeInTheDocument()
  })

  it('hides Reset inactive when the server lists none', async () => {
    mockEndpoints({ inactive: [] })
    renderPage()

    await findTable()
    expect(
      screen.queryByRole('button', { name: /inactive$/ }),
    ).not.toBeInTheDocument()
  })

  it.each([
    ['Show', 'show'],
    ['Mode', 'mode'],
    ['Season', 'season'],
    ['Viewers', 'viewers'],
    ['Last activity', 'last'],
  ])('sorts by the %s header', async (header, key) => {
    const user = userEvent.setup()
    mockEndpoints()
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

  it('orders the Season column with Pilots only first', async () => {
    mockEndpoints()
    renderPage('/?sort=season&dir=asc')

    const table = await findTable()
    expect(showTitles(table)).toEqual(['Reacher', 'Severance', 'The Bear'])
  })

  it('narrows by search and filters and clears them', async () => {
    const user = userEvent.setup()
    mockEndpoints()
    const router = renderPage()
    const table = await findTable()

    await user.type(
      screen.getByRole('searchbox', { name: 'Search by title' }),
      'sev',
    )
    await waitFor(() => expect(showTitles(table)).toEqual(['Severance']))

    await user.click(screen.getByRole('button', { name: 'Clear filters' }))
    await waitFor(() => expect(showRows(table)).toHaveLength(3))

    await user.click(screen.getByRole('combobox', { name: 'Status' }))
    await user.click(await screen.findByRole('option', { name: 'Inactive' }))
    await waitFor(() => expect(showTitles(table)).toEqual(['The Bear']))
    expect(
      new URLSearchParams(router.state.location.search).get('status'),
    ).toBe('inactive')

    await user.click(screen.getByRole('button', { name: 'Clear filters' }))
    await user.click(screen.getByRole('combobox', { name: 'Mode' }))
    await user.click(
      await screen.findByRole('option', { name: 'First season rolling' }),
    )
    await waitFor(() => expect(showTitles(table)).toEqual(['The Bear']))

    await user.click(screen.getByRole('button', { name: 'Clear filters' }))
    await waitFor(() => expect(showRows(table)).toHaveLength(3))
    expect(router.state.location.search).toBe('')
  })

  it('stops rolling without resetting the show', async () => {
    const calls = mockEndpoints()
    renderPage()

    const { user, region } = await openViewers('Severance viewers')
    await user.click(
      within(region).getByRole('button', { name: 'Stop rolling' }),
    )
    const dialog = await screen.findByRole('dialog', {
      name: 'Stop rolling Severance',
    })
    expect(
      within(dialog).getByRole('button', { name: 'Keep rolling' }),
    ).toBeInTheDocument()
    await user.click(
      within(dialog).getByRole('button', { name: 'Stop rolling' }),
    )

    await waitFor(() => expect(calls.stop).toHaveLength(1))
    const url = new URL(calls.stop[0] ?? '')
    expect(url.pathname).toBe('/v1/session-monitoring/rolling-monitored/1')
    expect(url.searchParams.get('reset')).toBe('false')
    expect(calls.reset).toEqual([])
  })

  it('resets one show', async () => {
    const calls = mockEndpoints()
    renderPage()

    const { user, region } = await openViewers('Severance viewers')
    await user.click(within(region).getByRole('button', { name: 'Reset show' }))
    const dialog = await screen.findByRole('dialog', {
      name: 'Reset Severance',
    })
    await user.click(
      within(dialog).getByRole('button', { name: 'Reset Severance' }),
    )

    await waitFor(() => expect(calls.reset).toEqual(['1']))
    expect(calls.stop).toEqual([])
  })

  it('resets every inactive show with the saved days', async () => {
    const user = userEvent.setup()
    const calls = mockEndpoints()
    renderPage()
    await findTable()

    await user.click(screen.getByRole('button', { name: 'Reset 1 inactive' }))
    const dialog = await screen.findByRole('dialog', {
      name: 'Reset 1 inactive show',
    })
    await user.click(
      within(dialog).getByRole('button', { name: 'Reset 1 show' }),
    )

    await waitFor(() =>
      expect(calls.resetInactive).toEqual([{ inactivityDays: 14 }]),
    )
  })

  it('checks sessions and shows the counts, the error and the changes', async () => {
    const user = userEvent.setup()
    const calls = mockEndpoints()
    renderPage()
    await findTable()

    await user.click(screen.getByRole('button', { name: 'Check now' }))

    expect(
      await screen.findByText(
        '3 sessions processed, 2 searches triggered, 1 rolling change.',
      ),
    ).toBeInTheDocument()
    expect(calls.runs).toBe(1)
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Sonarr 4K did not respond within 30 seconds.',
    )
    const changes = screen.getByRole('table', { name: 'Rolling changes' })
    expect(
      within(changes).getByText('Expanded to next season'),
    ).toBeInTheDocument()
    expect(within(changes).getByText('Season 3 requested.')).toBeInTheDocument()
  })

  it('hides Status and disables Manage enrollment while monitoring is off', async () => {
    mockEndpoints({ saved: { ...SAVED, enabled: false } })
    renderPage()

    await findTable()
    expect(
      screen.queryByRole('button', { name: 'Check now' }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Manage enrollment' }),
    ).toBeDisabled()
    expect(screen.getByText(/These 3 shows are paused/)).toBeInTheDocument()
  })

  it('shows only the settings while monitoring is off with nothing rolling', async () => {
    mockEndpoints({ saved: { ...SAVED, enabled: false }, shows: [] })
    renderPage()

    await findSection('Monitoring')
    expect(screen.queryByText('Rolling shows')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Check now' }),
    ).not.toBeInTheDocument()
  })

  it('saves the nested session monitoring settings', async () => {
    const user = userEvent.setup()
    const calls = mockEndpoints()
    renderPage()

    const resets = await findSection('Resets and cleanup')
    await user.click(
      resets.getByRole('switch', { name: 'Progressive cleanup' }),
    )
    const period = resets.getByLabelText('Inactivity period')
    await user.clear(period)
    await user.type(period, '30')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByText('Changes saved')).toBeInTheDocument()
    expect(calls.config).toEqual([
      {
        plexSessionMonitoring: {
          ...SAVED,
          enableProgressiveCleanup: true,
          inactivityResetDays: 30,
        },
      },
    ])
  })

  it('locks the settings from the draft switches', async () => {
    const user = userEvent.setup()
    mockEndpoints()
    renderPage()

    const monitoring = await findSection('Monitoring')
    const resets = await findSection('Resets and cleanup')
    expect(monitoring.getByLabelText('Polling interval')).toBeEnabled()

    await user.click(resets.getByRole('switch', { name: 'Automatic reset' }))
    expect(resets.getByLabelText('Check every')).toBeDisabled()
    expect(resets.getByLabelText('Inactivity period')).toBeEnabled()

    await user.click(
      monitoring.getByRole('switch', { name: 'Session monitoring' }),
    )
    expect(monitoring.getByLabelText('Polling interval')).toBeDisabled()
    expect(
      monitoring.getByLabelText('Remaining episodes threshold'),
    ).toBeDisabled()
    expect(resets.getByLabelText('Inactivity period')).toBeDisabled()
    expect(
      resets.getByRole('switch', { name: 'Progressive cleanup' }),
    ).toHaveAttribute('aria-disabled', 'true')
  })

  it('blocks Save on an out of range number', async () => {
    const user = userEvent.setup()
    const calls = mockEndpoints()
    renderPage()

    const monitoring = await findSection('Monitoring')
    const polling = monitoring.getByLabelText('Polling interval')
    await user.clear(polling)
    await user.type(polling, '5000')
    await user.tab()

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Save changes' }),
      ).toBeDisabled(),
    )
    expect(calls.config).toEqual([])
  })

  it('asks before closing the enrollment once a show is picked', async () => {
    const user = userEvent.setup()
    mockEndpoints()
    renderPage()
    await findTable()
    const open = async () => {
      await user.click(
        screen.getByRole('button', { name: 'Manage enrollment' }),
      )
      return screen.findByRole('dialog', { name: 'Manage enrollment' })
    }

    const first = await open()
    await within(first).findByRole('checkbox', { name: 'Select Ted Lasso' })
    await user.keyboard('{Escape}')
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Manage enrollment' }),
      ).toBeNull(),
    )
    expect(
      screen.queryByRole('dialog', { name: 'Leave without saving?' }),
    ).toBeNull()

    const dialog = await open()
    await user.click(
      await within(dialog).findByRole('checkbox', { name: 'Select Ted Lasso' }),
    )
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))

    expect(
      await screen.findByRole('dialog', { name: 'Leave without saving?' }),
    ).toBeInTheDocument()
  })

  it('shows the apply bar once touched and flags the missing mode', async () => {
    const user = userEvent.setup()
    mockEndpoints()
    renderPage()
    await findTable()

    await user.click(screen.getByRole('button', { name: 'Manage enrollment' }))
    const dialog = await screen.findByRole('dialog', {
      name: 'Manage enrollment',
    })
    await within(dialog).findByRole('checkbox', { name: 'Select Ted Lasso' })
    expect(within(dialog).queryByRole('status')).not.toBeInTheDocument()

    await user.click(
      within(dialog).getByRole('checkbox', { name: 'Select Ted Lasso' }),
    )
    expect(within(dialog).getByRole('status')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Apply' })).toBeDisabled()
    expect(
      within(dialog).getByRole('combobox', { name: 'Rolling mode' }),
    ).toHaveAttribute('aria-invalid', 'true')

    await user.click(
      within(dialog).getByRole('combobox', { name: 'Rolling mode' }),
    )
    await user.click(
      await screen.findByRole('option', { name: 'First season rolling' }),
    )
    expect(
      within(dialog).getByRole('combobox', { name: 'Rolling mode' }),
    ).not.toHaveAttribute('aria-invalid', 'true')
    expect(
      within(dialog).getByRole('button', { name: 'Apply to 1 show' }),
    ).toBeEnabled()
  })

  it('waits for the shows when cached settings failed their refetch', async () => {
    mockEndpoints()
    renderPage()
    await findTable()
    cleanup()
    server.use(
      http.get('/v1/config', serverError),
      http.get('/v1/session-monitoring/rolling-monitored', async () => {
        await delay('infinite')
      }),
    )
    await act(() => queryClient.refetchQueries({ queryKey: configKeys.config }))
    queryClient.removeQueries({ queryKey: sessionMonitoringKeys.rolling })

    renderPage()
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)))

    expect(screen.queryByRole('heading', { level: 1 })).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('keeps the enrollment list when a background refetch fails', async () => {
    const user = userEvent.setup()
    mockEndpoints()
    renderPage()
    await findTable()

    await user.click(screen.getByRole('button', { name: 'Manage enrollment' }))
    const dialog = await screen.findByRole('dialog', {
      name: 'Manage enrollment',
    })
    await within(dialog).findByRole('checkbox', { name: 'Select Ted Lasso' })
    server.use(http.get('/v1/session-monitoring/sonarr-shows', serverError))
    await refetchAndRender(sessionMonitoringKeys.enrollable)

    expect(
      within(dialog).getByRole('checkbox', { name: 'Select Ted Lasso' }),
    ).toBeInTheDocument()
    expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument()
  })

  it('applies the chosen mode to the selected shows', async () => {
    const user = userEvent.setup()
    const calls = mockEndpoints()
    renderPage()
    await findTable()

    await user.click(screen.getByRole('button', { name: 'Manage enrollment' }))
    const dialog = await screen.findByRole('dialog', {
      name: 'Manage enrollment',
    })
    await user.click(
      await within(dialog).findByRole('checkbox', { name: 'Select Ted Lasso' }),
    )
    await user.click(
      within(dialog).getByRole('checkbox', { name: 'Select Barry' }),
    )
    await user.click(
      within(dialog).getByRole('combobox', { name: 'Rolling mode' }),
    )
    await user.click(
      await screen.findByRole('option', { name: 'First season rolling' }),
    )
    await user.click(
      within(dialog).getByRole('button', { name: 'Apply to 2 shows' }),
    )

    await waitFor(() => expect(calls.bulk).toHaveLength(1))
    expect(calls.bulk[0]).toEqual({
      shows: [
        {
          sonarrSeriesId: 100,
          sonarrInstanceId: 1,
          title: 'Ted Lasso',
          guids: ['tvdb:383203'],
          rollingShowId: null,
        },
        {
          sonarrSeriesId: 101,
          sonarrInstanceId: 1,
          title: 'Barry',
          guids: ['tvdb:383203'],
          rollingShowId: null,
        },
      ],
      monitoringType: 'firstSeasonRolling',
      resetMonitoring: false,
    })
    expect(
      await within(dialog).findByText('2 of 2 shows updated.'),
    ).toBeInTheDocument()
  })

  it('starts shows over only through the confirm', async () => {
    const user = userEvent.setup()
    const calls = mockEndpoints()
    renderPage()
    await findTable()

    await user.click(screen.getByRole('button', { name: 'Manage enrollment' }))
    const dialog = await screen.findByRole('dialog', {
      name: 'Manage enrollment',
    })
    await user.click(
      await within(dialog).findByRole('checkbox', { name: 'Select Severance' }),
    )
    await user.click(
      within(dialog).getByRole('combobox', { name: 'Rolling mode' }),
    )
    await user.click(
      await screen.findByRole('option', { name: 'All seasons pilot rolling' }),
    )
    await user.click(
      within(dialog).getByRole('switch', {
        name: 'Start over from the beginning',
      }),
    )
    await user.click(
      within(dialog).getByRole('button', { name: 'Start over 1 show' }),
    )

    const confirm = await screen.findByRole('dialog', {
      name: 'Start over 1 show',
    })
    expect(calls.bulk).toEqual([])
    await user.click(
      within(confirm).getByRole('button', { name: 'Start over 1 show' }),
    )

    await waitFor(() => expect(calls.bulk).toHaveLength(1))
    expect(calls.bulk[0]).toMatchObject({
      shows: [{ sonarrSeriesId: 10, rollingShowId: 1 }],
      monitoringType: 'allSeasonPilotRolling',
      resetMonitoring: true,
    })
  })

  it('tells the admin to run it again when a show failed', async () => {
    const user = userEvent.setup()
    mockEndpoints({ bulkFailed: 1 })
    renderPage()
    await findTable()

    await user.click(screen.getByRole('button', { name: 'Manage enrollment' }))
    const dialog = await screen.findByRole('dialog', {
      name: 'Manage enrollment',
    })
    await user.click(
      await within(dialog).findByRole('checkbox', { name: 'Select Ted Lasso' }),
    )
    await user.click(
      within(dialog).getByRole('checkbox', { name: 'Select Barry' }),
    )
    await user.click(
      within(dialog).getByRole('combobox', { name: 'Rolling mode' }),
    )
    await user.click(
      await screen.findByRole('option', { name: 'Pilot rolling' }),
    )
    await user.click(
      within(dialog).getByRole('button', { name: 'Apply to 2 shows' }),
    )

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      '1 show was not updated.',
    )
    expect(
      within(dialog).getByText('1 of 2 shows updated.'),
    ).toBeInTheDocument()

    await user.click(
      within(dialog).getByRole('button', { name: 'Back to the list' }),
    )
    expect(
      within(dialog).getByRole('checkbox', { name: 'Select Barry' }),
    ).toHaveAttribute('aria-checked', 'true')
  })

  it('pages the enrollment list and keeps the selection across pages', async () => {
    const user = userEvent.setup()
    const calls = mockEndpoints({ enrollableList: pagedEnrollable })
    renderPage()
    await findTable()

    await user.click(screen.getByRole('button', { name: 'Manage enrollment' }))
    const dialog = await screen.findByRole('dialog', {
      name: 'Manage enrollment',
    })
    const list = await within(dialog).findByRole('table', {
      name: 'Shows sent to Sonarr',
    })
    const pageRows = () => within(list).getAllByRole('row').slice(1)
    expect(pageRows()).toHaveLength(20)

    await user.click(
      within(dialog).getByRole('checkbox', { name: 'Select Show 01' }),
    )
    await user.click(within(dialog).getByLabelText('Go to next page'))
    expect(pageRows()).toHaveLength(5)
    expect(
      within(dialog).queryByRole('checkbox', { name: 'Select Show 01' }),
    ).not.toBeInTheDocument()

    await user.click(
      within(dialog).getByRole('checkbox', { name: 'Select Show 25' }),
    )
    await user.click(
      within(dialog).getByRole('combobox', { name: 'Rolling mode' }),
    )
    await user.click(
      await screen.findByRole('option', { name: 'First season rolling' }),
    )
    await user.click(
      within(dialog).getByRole('button', { name: 'Apply to 2 shows' }),
    )

    await waitFor(() => expect(calls.bulk).toHaveLength(1))
    expect(calls.bulk[0]?.shows.map((show) => show.sonarrSeriesId)).toEqual([
      1, 25,
    ])
  })

  it('returns the enrollment list to the first page on a new search', async () => {
    const user = userEvent.setup()
    mockEndpoints({ enrollableList: pagedEnrollable })
    renderPage()
    await findTable()

    await user.click(screen.getByRole('button', { name: 'Manage enrollment' }))
    const dialog = await screen.findByRole('dialog', {
      name: 'Manage enrollment',
    })
    await user.click(await within(dialog).findByLabelText('Go to next page'))
    expect(
      within(dialog).getByRole('checkbox', { name: 'Select Show 21' }),
    ).toBeInTheDocument()

    await user.type(
      within(dialog).getByRole('searchbox', { name: 'Search by title' }),
      'Show',
    )
    expect(
      within(dialog).getByRole('checkbox', { name: 'Select Show 01' }),
    ).toBeInTheDocument()
    expect(
      within(dialog).queryByRole('checkbox', { name: 'Select Show 21' }),
    ).not.toBeInTheDocument()
  })

  it('offers enrollment when nothing is rolling yet', async () => {
    mockEndpoints({ shows: [], inactive: [] })
    renderPage()

    expect(await screen.findByText('No rolling shows yet')).toBeInTheDocument()
    expect(
      screen.queryByRole('searchbox', { name: 'Search by title' }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Manage enrollment' }),
    ).toBeEnabled()
  })

  it('says when no show is inactive and shows all again', async () => {
    const user = userEvent.setup()
    mockEndpoints({ inactive: [] })
    const router = renderPage('/?status=inactive')

    expect(await screen.findByText('No inactive shows')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Show all' }))

    await findTable()
    expect(router.state.location.search).toBe('')
  })

  it('says when no show matches the filters', async () => {
    mockEndpoints()
    renderPage('/?q=zelda')

    expect(
      await screen.findByText('No shows match these filters'),
    ).toBeInTheDocument()
  })

  it('says when no show was ever sent to Sonarr', async () => {
    const user = userEvent.setup()
    mockEndpoints({ enrollableList: [] })
    renderPage()
    await findTable()

    await user.click(screen.getByRole('button', { name: 'Manage enrollment' }))
    const dialog = await screen.findByRole('dialog', {
      name: 'Manage enrollment',
    })
    expect(
      await within(dialog).findByText('No shows sent to Sonarr yet'),
    ).toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: /^Apply/ })).toBeNull()
  })

  it('keeps the skeleton up while the inactive shows are loading', async () => {
    const calls = mockEndpoints()
    server.use(
      http.get('/v1/session-monitoring/rolling-monitored/inactive', () => {
        calls.inactiveDays.push('pending')
        return delay('infinite')
      }),
    )
    renderPage()

    await waitFor(() => expect(calls.inactiveDays).toEqual(['pending']))
    expect(document.querySelector('[aria-busy="true"]')).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: 'Session monitoring' }),
    ).not.toBeInTheDocument()
  })

  it('shows the error with a retry that reloads the list', async () => {
    const user = userEvent.setup()
    mockEndpoints()
    let fail = true
    server.use(
      http.get('/v1/session-monitoring/rolling-monitored', () =>
        fail
          ? HttpResponse.json(
              {
                statusCode: 500,
                error: 'Internal Server Error',
                message: 'Failed to fetch rolling monitored shows',
              },
              { status: 500 },
            )
          : HttpResponse.json({ success: true, shows: rolling }),
      ),
    )
    renderPage()

    expect(
      await screen.findByRole('alert', {}, { timeout: 3000 }),
    ).toHaveTextContent('Failed to fetch rolling monitored shows')
    fail = false
    await user.click(screen.getByRole('button', { name: 'Retry' }))

    expect(await findTable()).toBeInTheDocument()
  })
})
