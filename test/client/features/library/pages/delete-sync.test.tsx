import type { ProgressEvent } from '@root/types/progress.types.js'
import { QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import DeleteSyncPage from '@/features/library/pages/delete-sync'
import type { ScheduleStatus } from '@/hooks/useSchedule'
import { setFormatLocale } from '@/lib/format'
import { queryClient } from '@/lib/queryClient'
import { useProgressStore } from '@/stores/progressStore'
import type { components, paths } from '@/types/api.js'
import { server } from '../../../setup.js'
import { stubViewport } from '../../../viewport.js'

type DryRunResponse = components['schemas']['DeleteSyncDryRunResponse']
type RadarrInstance =
  paths['/v1/radarr/instances']['get']['responses'][200]['content']['application/json'][number]
type SonarrInstance = components['schemas']['SonarrInstance']

const savedConfig = {
  deletionMode: 'watchlist',
  deleteSyncRequiredTagRegex: '',
  deleteMovie: true,
  deleteEndedShow: true,
  deleteContinuingShow: false,
  deleteFiles: true,
  deleteSyncCleanupApprovals: true,
  respectUserSyncSetting: true,
  deleteSyncTrackedOnly: false,
  maxDeletionPrevention: 20,
  enablePlexPlaylistProtection: true,
  plexProtectionPlaylistName: 'Do Not Delete',
  deleteSyncNotify: 'discord-only',
  deleteSyncNotifyOnlyOnDeletion: true,
  removedTagMode: 'special-tag',
  removedTagPrefix: 'pulsarr-removed',
}

function makeSchedule({
  enabled = true,
  expression = '0 1 * * 0',
} = {}): ScheduleStatus {
  return {
    id: 1,
    name: 'delete-sync',
    type: 'cron',
    config: { expression },
    enabled,
    last_run: {
      time: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
      status: 'completed',
    },
    next_run: {
      time: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
      status: 'pending',
    },
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  }
}

const radarr: RadarrInstance = {
  id: 1,
  name: 'Radarr 4K',
  baseUrl: 'http://radarr:7878',
  apiKey: 'real-key',
  qualityProfile: 4,
  rootFolder: '/movies',
  bypassIgnored: false,
  searchOnAdd: true,
  minimumAvailability: 'released',
  monitor: 'movieOnly',
  tags: [],
  isDefault: true,
  skipDefaultRoutingWhenNoMatch: false,
}

const sonarr: SonarrInstance = {
  id: 3,
  name: 'Sonarr Anime',
  baseUrl: 'http://sonarr:8989',
  apiKey: 'real-key',
  bypassIgnored: false,
  seasonMonitoring: 'all',
  monitorNewItems: 'all',
  searchOnAdd: true,
  createSeasonFolders: true,
  tags: [],
  isDefault: true,
  seriesType: 'standard',
  skipDefaultRoutingWhenNoMatch: false,
}

const dryRunOk: DryRunResponse = {
  success: true,
  message: 'Delete sync dry run completed: Would delete 3 items',
  results: {
    total: { deleted: 3, skipped: 40, processed: 47, protected: 4 },
    movies: {
      deleted: 2,
      skipped: 30,
      protected: 4,
      items: [
        { title: 'Arrival', guid: 'tmdb:329865', instance: '1' },
        { title: 'Zodiac', guid: 'tmdb:1949', instance: '9' },
      ],
    },
    shows: {
      deleted: 1,
      skipped: 10,
      protected: 0,
      items: [{ title: 'Dark', guid: 'tvdb:334824', instance: '3' }],
    },
  },
}

const SAFETY_MESSAGE =
  'Safety check failed: Would delete 175 out of 1089 eligible items (16.07%), which exceeds maximum allowed percentage of 10%.'

const dryRunAborted: DryRunResponse = {
  success: true,
  message: `Delete sync dry run aborted: ${SAFETY_MESSAGE}`,
  results: {
    total: { deleted: 0, skipped: 1089, processed: 1089 },
    movies: { deleted: 0, skipped: 800, items: [] },
    shows: { deleted: 0, skipped: 289, items: [] },
    safetyTriggered: true,
    safetyMessage: SAFETY_MESSAGE,
  },
}

function mockEndpoints({
  saved = savedConfig,
  schedule = makeSchedule(),
  scheduleStatus = 200,
  dryRun = dryRunOk,
  dryRunGate = Promise.resolve(),
} = {}) {
  const calls = {
    config: [] as unknown[],
    schedule: [] as unknown[],
    run: 0,
    dryRun: 0,
  }
  let current: object = saved
  server.use(
    http.get('/v1/config', () =>
      HttpResponse.json({ success: true, config: current }),
    ),
    http.get('/v1/scheduler/schedules/delete-sync', () =>
      scheduleStatus === 200
        ? HttpResponse.json(schedule)
        : HttpResponse.json(
            {
              statusCode: scheduleStatus,
              error: 'Internal Server Error',
              message: 'Unable to fetch schedule',
            },
            { status: scheduleStatus },
          ),
    ),
    http.put('/v1/config', async ({ request }) => {
      const body = await request.json()
      calls.config.push(body)
      current = { ...current, ...(body as object) }
      return HttpResponse.json({ success: true, config: current })
    }),
    http.put('/v1/scheduler/schedules/delete-sync', async ({ request }) => {
      calls.schedule.push(await request.json())
      return HttpResponse.json({ success: true, message: 'ok' })
    }),
    http.post('/v1/scheduler/schedules/delete-sync/run', () => {
      calls.run += 1
      return HttpResponse.json({ success: true, message: 'ok' })
    }),
    http.post('/v1/scheduler/schedules/delete-sync/dry-run', async () => {
      calls.dryRun += 1
      await dryRunGate
      return HttpResponse.json(dryRun)
    }),
    http.get('/v1/radarr/instances', () => HttpResponse.json([radarr])),
    http.get('/v1/sonarr/instances', () => HttpResponse.json([sonarr])),
  )
  return calls
}

const SELF_READING: ProgressEvent = {
  operationId: 'self-watchlist-sync',
  type: 'self-watchlist',
  phase: 'reading',
  progress: 40,
  message: 'Reading your watchlist',
  metadata: { stage: 'reading', count: { done: 9, total: 20, unit: 'pages' } },
}

const FRIENDS_FINDING: ProgressEvent = {
  operationId: 'others-watchlist-sync',
  type: 'others-watchlist',
  phase: 'finding-friends',
  progress: 0,
  message: 'Finding friends',
  metadata: { stage: 'finding-friends', count: null },
}

function renderPage() {
  const router = createMemoryRouter([
    { path: '*', element: <DeleteSyncPage /> },
  ])
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

async function runDryRun(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: 'Dry run' }))
  return screen.findByText(/^Ran at/)
}

describe('DeleteSyncPage', () => {
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
    setFormatLocale(undefined)
    vi.unstubAllGlobals()
  })

  it('renders the saved settings and the schedule pill', async () => {
    mockEndpoints()
    renderPage()

    expect(await screen.findByText('Runs and schedule')).toBeInTheDocument()
    expect(screen.getByText('Enabled')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /Watchlist based/ })).toBeChecked()
    expect(screen.getByRole('switch', { name: 'Delete movies' })).toBeChecked()
    expect(
      screen.getByRole('switch', { name: 'Delete continuing shows' }),
    ).not.toBeChecked()
    expect(screen.getByText("This can't be undone.")).toBeInTheDocument()
    expect(screen.getByLabelText('Max deletion')).toHaveValue('20')
    expect(
      screen.getByText(
        'Aborts if a run would delete more than 20% of eligible items.',
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        'Every run creates "Do Not Delete" for Plex users who lack it.',
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('combobox', { name: 'Send the run summary to' }),
    ).toHaveTextContent('Discord webhook and direct messages')
    expect(
      screen.getByText('Runs Sundays at 1:00 AM, server time.'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Excluded titles count as not on any watchlist.'),
    ).toBeInTheDocument()
    expect(screen.queryByLabelText('Required tag pattern')).toBeNull()
    expect(screen.getByRole('button', { name: 'Dry run' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Run now' })).toBeEnabled()
  })

  it('shows the removal tag, the User tags warning and the regex in tag mode', async () => {
    mockEndpoints({
      saved: {
        ...savedConfig,
        deletionMode: 'tag-based',
        deleteSyncRequiredTagRegex: 'pulsarr2-removed',
        removedTagMode: 'remove',
      },
    })
    renderPage()

    expect(await screen.findByText('pulsarr-removed')).toBeInTheDocument()
    expect(
      screen.getByText(
        'User tags is set to "Remove the tag", so nothing gets this tag.',
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'User tags' }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Required tag pattern')).toHaveValue(
      'pulsarr2-removed',
    )
    expect(
      screen.getByRole('switch', { name: 'Respect user sync settings' }),
    ).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByText('Only used in watchlist mode.')).toBeInTheDocument()
    expect(
      screen.getByText('Excluded titles are candidates even without the tag.'),
    ).toBeInTheDocument()
  })

  it('drops the warning when User tags swaps for the removal tag', async () => {
    mockEndpoints({ saved: { ...savedConfig, deletionMode: 'tag-based' } })
    renderPage()

    expect(await screen.findByText('pulsarr-removed')).toBeInTheDocument()
    expect(screen.queryByText(/^User tags is set to/)).toBeNull()
    expect(
      screen.getByRole('button', { name: 'User tags' }),
    ).toBeInTheDocument()
  })

  it('warns and locks what depends on a content type when nothing is selected', async () => {
    mockEndpoints({
      saved: {
        ...savedConfig,
        deleteMovie: false,
        deleteEndedShow: false,
        deleteContinuingShow: false,
      },
    })
    renderPage()

    expect(
      await screen.findByText('Nothing is selected, so runs delete nothing.'),
    ).toBeInTheDocument()
    expect(screen.getByText('Pick movies or shows first.')).toBeInTheDocument()
    expect(
      screen.getByRole('switch', { name: 'Delete files' }),
    ).toHaveAttribute('aria-disabled', 'true')
    expect(
      screen.getByRole('switch', { name: 'Clean up approval records' }),
    ).toHaveAttribute('aria-disabled', 'true')
    expect(screen.queryByText("This can't be undone.")).toBeNull()
    expect(
      screen.getByText('Nothing is selected, so a run would do nothing.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Run now' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Dry run' })).toBeEnabled()
  })

  it('locks both runs while there are unsaved changes', async () => {
    const user = userEvent.setup()
    mockEndpoints()
    renderPage()

    await user.click(
      await screen.findByRole('switch', { name: 'Delete continuing shows' }),
    )

    expect(
      screen.getByText('Save or discard your changes first.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Dry run' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Run now' })).toBeDisabled()
  })

  it('puts the schedule-off reason on Manual run and keeps Dry run available', async () => {
    mockEndpoints({ schedule: makeSchedule({ enabled: false }) })
    renderPage()

    expect(await screen.findByText('Disabled')).toBeInTheDocument()
    expect(screen.getByText('Not scheduled')).toBeInTheDocument()
    expect(
      screen.getByText('Turn on the schedule to run it now.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Run now' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Dry run' })).toBeEnabled()
    expect(screen.getByRole('combobox', { name: 'Day' })).toBeEnabled()
  })

  it('shows the dry run totals and the item list', async () => {
    const user = userEvent.setup()
    let release: () => void = () => undefined
    const dryRunGate = new Promise<void>((resolve) => {
      release = resolve
    })
    const calls = mockEndpoints({ dryRunGate })
    renderPage()

    await user.click(await screen.findByRole('button', { name: 'Dry run' }))
    expect(
      await screen.findByRole('button', { name: 'Running...' }),
    ).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Run now' })).toBeDisabled()

    release()
    expect(await screen.findByText(/^Ran at/)).toBeInTheDocument()
    expect(calls.dryRun).toBe(1)
    expect(
      screen.getByText('47 processed. Would delete 2 movies and 1 show.'),
    ).toBeInTheDocument()
    const table = screen.getByRole('table', { name: 'Dry run by type' })
    const movies = within(table).getByRole('row', { name: /Movies/ })
    expect(
      within(movies)
        .getAllByRole('cell')
        .map((cell) => cell.textContent),
    ).toEqual(['Movies', '2', '4', '30'])

    await user.click(screen.getByRole('button', { name: 'View 3 items' }))
    const dialog = await screen.findByRole('dialog')
    expect(
      within(dialog).getByText(
        'Would delete 2 movies and 1 show, files included.',
      ),
    ).toBeInTheDocument()
    const rows = () =>
      within(within(dialog).getByRole('table')).getAllByRole('row').slice(1)
    expect(rows().map((row) => row.textContent)).toEqual([
      expect.stringContaining('Arrival'),
      expect.stringContaining('Zodiac'),
    ])
    expect(within(rows()[0]).getAllByText('Radarr 4K')).not.toHaveLength(0)
    expect(within(rows()[1]).getAllByText('9')).not.toHaveLength(0)

    await user.click(within(dialog).getByRole('button', { name: 'Title' }))
    expect(rows().map((row) => row.textContent)).toEqual([
      expect.stringContaining('Zodiac'),
      expect.stringContaining('Arrival'),
    ])

    await user.type(
      within(dialog).getByRole('searchbox', {
        name: 'Search by title or GUID',
      }),
      'arr',
    )
    expect(rows()).toHaveLength(1)
    expect(within(dialog).getByText('1 of 2 movies')).toBeInTheDocument()

    const types = within(dialog).getByRole('group', { name: 'Content type' })
    await user.click(within(types).getByRole('button', { name: /Shows/ }))
    expect(within(dialog).getByText('No shows match "arr"')).toBeInTheDocument()
    await user.click(
      within(dialog).getByRole('button', { name: 'Clear search' }),
    )
    expect(rows().map((row) => row.textContent)).toEqual([
      expect.stringContaining('Sonarr Anime'),
    ])
  })

  it('shows the running watchlist syncs under the dry run', async () => {
    const user = userEvent.setup()
    let release: () => void = () => undefined
    const dryRunGate = new Promise<void>((resolve) => {
      release = resolve
    })
    const calls = mockEndpoints({ dryRunGate })
    renderPage()

    await user.click(await screen.findByRole('button', { name: 'Dry run' }))
    await vi.waitFor(() => expect(calls.dryRun).toBe(1))
    act(() => {
      useProgressStore.setState({
        watchlistSyncCache: {
          'self-watchlist': SELF_READING,
          'others-watchlist': FRIENDS_FINDING,
        },
      })
    })

    const list = await screen.findByRole('list', { name: 'Watchlist syncs' })
    const [self, friends] = within(list).getAllByRole('listitem')
    expect(within(self).getByText('Your watchlist')).toBeInTheDocument()
    expect(within(self).getByText('Reading your watchlist')).toBeInTheDocument()
    expect(within(self).getByText('9 of 20 pages')).toBeInTheDocument()
    expect(within(friends).getByText("Friends' watchlists")).toBeInTheDocument()
    expect(within(friends).getByText('Finding friends')).toBeInTheDocument()

    release()
    expect(await screen.findByText(/^Ran at/)).toBeInTheDocument()
    expect(
      screen.queryByRole('list', { name: 'Watchlist syncs' }),
    ).not.toBeInTheDocument()
  })

  it('marks the dry run stale after a settings save but not a schedule change', async () => {
    const user = userEvent.setup()
    mockEndpoints()
    renderPage()

    await runDryRun(user)
    await user.click(screen.getByRole('combobox', { name: 'Day' }))
    await user.click(await screen.findByRole('option', { name: 'Monday' }))
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByText('Changes saved')).toBeInTheDocument()
    expect(
      screen.queryByText(
        'Settings changed since this dry run. Run it again to update it.',
      ),
    ).toBeNull()

    await user.click(
      screen.getByRole('switch', { name: 'Delete continuing shows' }),
    )
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(
      await screen.findByText(
        'Settings changed since this dry run. Run it again to update it.',
      ),
    ).toBeInTheDocument()
  })

  it('shows a safety abort as a warning with the server text', async () => {
    const user = userEvent.setup()
    mockEndpoints({ dryRun: dryRunAborted })
    renderPage()

    await runDryRun(user)

    expect(screen.getByText('1,089 processed.')).toBeInTheDocument()
    const alert = screen.getByRole('alert')
    expect(
      within(alert).getByText('Dry run aborted, nothing would be deleted.'),
    ).toBeInTheDocument()
    expect(within(alert).getByText(SAFETY_MESSAGE)).toBeInTheDocument()
    expect(screen.queryByRole('table')).toBeNull()
    expect(screen.queryByRole('button', { name: /^View/ })).toBeNull()
  })

  it('offers a dry run first from the Run now confirm, then runs for real', async () => {
    const user = userEvent.setup()
    const calls = mockEndpoints()
    renderPage()

    await user.click(await screen.findByRole('button', { name: 'Run now' }))
    let dialog = await screen.findByRole('dialog')
    expect(
      within(dialog).getByText(
        "Deletes for real with the saved settings, files on disk included. This can't be undone.",
      ),
    ).toBeInTheDocument()
    expect(
      within(dialog).getByText('No dry run matches the saved settings.'),
    ).toBeInTheDocument()

    await user.click(
      within(dialog).getByRole('button', { name: 'Dry run first' }),
    )
    expect(await screen.findByText(/^Ran at/)).toBeInTheDocument()
    expect(calls.dryRun).toBe(1)
    expect(calls.run).toBe(0)

    await user.click(screen.getByRole('button', { name: 'Run now' }))
    dialog = await screen.findByRole('dialog')
    expect(
      within(dialog).getByText(
        /^The dry run at .+ would delete 2 movies and 1 show\.$/,
      ),
    ).toBeInTheDocument()
    expect(
      within(dialog).queryByRole('button', { name: 'Dry run first' }),
    ).toBeNull()

    await user.click(
      within(dialog).getByRole('button', { name: 'Run and delete' }),
    )
    await vi.waitFor(() => expect(calls.run).toBe(1))
  })

  it('confirms before a save turns the schedule on', async () => {
    const user = userEvent.setup()
    const calls = mockEndpoints({ schedule: makeSchedule({ enabled: false }) })
    renderPage()

    await user.click(
      await screen.findByRole('switch', { name: 'Run on a schedule' }),
    )
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    const dialog = await screen.findByRole('dialog')
    expect(
      within(dialog).getByText(
        'Delete sync will run Sundays at 1:00 AM, server time, and delete for real, files on disk included.',
      ),
    ).toBeInTheDocument()
    expect(
      within(dialog).getByText('No dry run matches these settings yet.'),
    ).toBeInTheDocument()
    expect(calls.schedule).toEqual([])

    await user.click(
      within(dialog).getByRole('button', { name: 'Save and turn on' }),
    )

    expect(await screen.findByText('Changes saved')).toBeInTheDocument()
    expect(calls.schedule).toEqual([
      { type: 'cron', config: { expression: '0 1 * * 0' }, enabled: true },
    ])
  })

  it('names the matching dry run when a save turns the schedule on', async () => {
    const user = userEvent.setup()
    mockEndpoints({ schedule: makeSchedule({ enabled: false }) })
    renderPage()

    await runDryRun(user)
    await user.click(screen.getByRole('switch', { name: 'Run on a schedule' }))
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    const dialog = await screen.findByRole('dialog')
    expect(
      within(dialog).getByText(
        /^The dry run at .+ would delete 2 movies and 1 show\.$/,
      ),
    ).toBeInTheDocument()
  })

  it('ignores Enter in a field while the form is invalid', async () => {
    const user = userEvent.setup()
    const calls = mockEndpoints({ schedule: makeSchedule({ enabled: false }) })
    renderPage()

    await user.click(
      await screen.findByRole('switch', { name: 'Run on a schedule' }),
    )
    const max = screen.getByLabelText('Max deletion')
    await user.clear(max)
    await user.type(max, '150{Enter}')

    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(calls.config).toEqual([])
    expect(calls.schedule).toEqual([])
  })

  it('blocks saving an out of range max deletion', async () => {
    const user = userEvent.setup()
    mockEndpoints()
    renderPage()

    const max = await screen.findByLabelText('Max deletion')
    await user.clear(max)
    await user.type(max, '150')
    await user.tab()

    expect(
      screen.getByText('Enter a whole number from 1 to 100.'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Aborts a run that would delete more than this share.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled()
  })

  it('shows a retry alert when the schedule fails to load', async () => {
    mockEndpoints({ scheduleStatus: 500 })
    renderPage()

    const alert = await screen.findByRole('alert', {}, { timeout: 3000 })
    expect(
      within(alert).getByText('Unable to fetch schedule'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
    expect(screen.queryByText('Runs and schedule')).toBeNull()
  })
})
