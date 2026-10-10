import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import PlexLabelsPage from '@/features/users/pages/plex-labels'
import type { ScheduleStatus } from '@/hooks/useSchedule'
import { setFormatLocale } from '@/lib/format'
import { queryClient } from '@/lib/queryClient'
import { useProgressStore } from '@/stores/progressStore'
import { server } from '../../../setup.js'
import { stubViewport } from '../../../viewport.js'

const plexLabelSync = {
  enabled: true,
  labelPrefix: 'pulsarr',
  labelNamingSource: 'username',
  cleanupOrphanedLabels: true,
  removedLabelMode: 'remove',
  removedLabelPrefix: 'pulsarr:removed',
  autoResetOnScheduledSync: false,
  tagSync: { enabled: false, syncRadarrTags: true, syncSonarrTags: true },
}

function makeSchedule({
  enabled = true,
  expression = '0 2 * * 0',
} = {}): ScheduleStatus {
  return {
    id: 1,
    name: 'plex-label-full-sync',
    type: 'cron',
    config: { expression },
    enabled,
    last_run: {
      time: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      status: 'completed',
    },
    next_run: {
      time: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      status: 'pending',
    },
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  }
}

function mockEndpoints({
  scheduleStatus = 200,
  schedule = makeSchedule(),
  saved = plexLabelSync,
} = {}) {
  const savedConfig = { plexLabelSync: saved }
  const configBodies: unknown[] = []
  const scheduleBodies: unknown[] = []
  const actionCalls: string[] = []
  server.use(
    http.get('/v1/config', () =>
      HttpResponse.json({ success: true, config: savedConfig }),
    ),
    http.get('/v1/scheduler/schedules/plex-label-full-sync', () =>
      HttpResponse.json(schedule),
    ),
    http.put('/v1/config', async ({ request }) => {
      const body = await request.json()
      configBodies.push(body)
      return HttpResponse.json({
        success: true,
        config: { ...savedConfig, ...(body as object) },
      })
    }),
    http.put(
      '/v1/scheduler/schedules/plex-label-full-sync',
      async ({ request }) => {
        scheduleBodies.push(await request.json())
        return scheduleStatus === 200
          ? HttpResponse.json({ success: true, message: 'ok' })
          : HttpResponse.json({}, { status: scheduleStatus })
      },
    ),
    http.post('/v1/labels/cleanup', () => {
      actionCalls.push('cleanup')
      return HttpResponse.json({
        success: true,
        message: 'Cleaned up 3 expired pending syncs and 12 orphaned labels',
        pending: { removed: 3, failed: 0 },
        orphaned: { removed: 12, failed: 0 },
      })
    }),
    http.delete('/v1/labels/remove', () => {
      actionCalls.push('remove')
      return HttpResponse.json({
        success: true,
        message: 'Removed 9 Pulsarr labels from 7 items',
        mode: 'remove',
        results: { processed: 7, removed: 9, failed: 0 },
      })
    }),
  )
  return { configBodies, scheduleBodies, actionCalls }
}

function renderPage() {
  const router = createMemoryRouter([
    { path: '*', element: <PlexLabelsPage /> },
  ])
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

describe('PlexLabelsPage', () => {
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

  it('renders the saved settings and schedule', async () => {
    mockEndpoints()
    renderPage()

    expect(await screen.findByText('Full sync')).toBeInTheDocument()
    expect(
      screen.getByRole('switch', { name: 'Label content in Plex' }),
    ).toBeChecked()
    expect(screen.getByLabelText('Prefix')).toHaveValue('pulsarr')
    expect(screen.getByText('pulsarr:jamie')).toBeInTheDocument()
    expect(
      screen.getByRole('radio', { name: /Remove the label/ }),
    ).toBeChecked()
    expect(
      screen.getByRole('switch', { name: 'Clean up orphaned labels on sync' }),
    ).toBeChecked()
    expect(
      screen.getByRole('switch', { name: 'Run on a schedule' }),
    ).toBeChecked()
    expect(screen.getByRole('combobox', { name: 'Day' })).toHaveTextContent(
      'Sunday',
    )
    expect(screen.getByRole('combobox', { name: 'Time' })).toHaveTextContent(
      /^2:00\sAM/,
    )
    expect(screen.getByLabelText('Removed label')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Clean up' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Run now' })).toBeEnabled()
  })

  it('shows a six-field schedule as its day and time', async () => {
    mockEndpoints({ schedule: makeSchedule({ expression: '0 0 2 * * *' }) })
    renderPage()

    expect(
      await screen.findByRole('combobox', { name: 'Day' }),
    ).toHaveTextContent('Every day')
    expect(screen.getByRole('combobox', { name: 'Time' })).toHaveTextContent(
      /^2:00\sAM/,
    )
  })

  it('saves the config and the schedule through their own endpoints', async () => {
    const user = userEvent.setup()
    const { configBodies, scheduleBodies } = mockEndpoints()
    renderPage()

    await user.click(
      await screen.findByRole('switch', { name: 'Sync tags as labels' }),
    )
    await user.click(screen.getByRole('combobox', { name: 'Day' }))
    await user.click(await screen.findByRole('option', { name: 'Monday' }))
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByText('Changes saved')).toBeInTheDocument()
    expect(configBodies).toEqual([
      {
        plexLabelSync: {
          ...plexLabelSync,
          tagSync: { ...plexLabelSync.tagSync, enabled: true },
        },
      },
    ])
    expect(scheduleBodies).toEqual([
      { type: 'cron', config: { expression: '0 2 * * 1' }, enabled: true },
    ])
  })

  it('keeps the saved config and only the schedule dirty when the schedule save fails', async () => {
    const user = userEvent.setup()
    const { configBodies, scheduleBodies } = mockEndpoints({
      scheduleStatus: 500,
    })
    renderPage()

    await user.click(
      await screen.findByRole('switch', {
        name: 'Clean up orphaned labels on sync',
      }),
    )
    await user.click(screen.getByRole('switch', { name: 'Run on a schedule' }))
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(
      await screen.findByText(
        'The schedule was not saved. Save again to retry.',
      ),
    ).toBeInTheDocument()
    expect(configBodies).toHaveLength(1)
    expect(scheduleBodies).toEqual([
      { type: 'cron', config: { expression: '0 2 * * 0' }, enabled: false },
    ])
    expect(screen.getByText('You have unsaved changes')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Discard' }))

    expect(
      screen.getByRole('switch', { name: 'Run on a schedule' }),
    ).toBeChecked()
    expect(
      screen.getByRole('switch', { name: 'Clean up orphaned labels on sync' }),
    ).not.toBeChecked()
    expect(
      screen.queryByText('You have unsaved changes'),
    ).not.toBeInTheDocument()
  })

  it('disables dependent fields in place', async () => {
    const user = userEvent.setup()
    mockEndpoints()
    renderPage()

    expect(
      await screen.findByRole('switch', { name: 'Radarr tags on movies' }),
    ).toHaveAttribute('aria-disabled', 'true')
    expect(
      screen.getByRole('switch', { name: 'Sonarr tags on shows' }),
    ).toHaveAttribute('aria-disabled', 'true')

    await user.click(
      screen.getByRole('switch', { name: 'Sync tags as labels' }),
    )
    expect(
      screen.getByRole('switch', { name: 'Radarr tags on movies' }),
    ).not.toHaveAttribute('aria-disabled')

    await user.click(screen.getByRole('switch', { name: 'Run on a schedule' }))
    expect(screen.getByRole('combobox', { name: 'Day' })).toBeDisabled()
    expect(screen.getByRole('combobox', { name: 'Time' })).toBeDisabled()
  })

  it('locks the actions while labeling is off or the page is dirty', async () => {
    const user = userEvent.setup()
    mockEndpoints({ saved: { ...plexLabelSync, enabled: false } })
    renderPage()

    expect(
      await screen.findByRole('button', { name: 'Clean up' }),
    ).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Remove' })).toBeDisabled()
    expect(
      screen.getAllByText('Turn on Label content in Plex and save first.'),
    ).toHaveLength(2)
    expect(screen.getByLabelText('Prefix')).toBeEnabled()

    await user.click(
      screen.getByRole('switch', { name: 'Label content in Plex' }),
    )
    expect(
      screen.getByText('Save or discard your changes before running these.'),
    ).toBeInTheDocument()
  })

  it('explains why clean-up is off when orphan clean-up is not saved', async () => {
    mockEndpoints({ saved: { ...plexLabelSync, cleanupOrphanedLabels: false } })
    renderPage()

    expect(
      await screen.findByRole('button', { name: 'Clean up' }),
    ).toBeDisabled()
    expect(
      screen.getByText(
        'Turn on Clean up orphaned labels on sync and save first.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove' })).toBeEnabled()
  })

  it('runs a clean-up and shows its results', async () => {
    const user = userEvent.setup()
    const { actionCalls } = mockEndpoints()
    renderPage()

    await user.click(await screen.findByRole('button', { name: 'Clean up' }))

    expect(await screen.findByText(/^Ran at/)).toBeInTheDocument()
    expect(actionCalls).toEqual(['cleanup'])
    const table = screen.getByRole('table')
    expect(
      within(table).getByRole('columnheader', { name: 'Orphans removed' }),
    ).toBeInTheDocument()
    expect(within(table).getByText('12')).toBeInTheDocument()
    expect(within(table).getByText('3')).toBeInTheDocument()
    expect(
      within(table).queryByRole('columnheader', { name: 'Queue failed' }),
    ).not.toBeInTheDocument()
  })

  it('removes labels only after confirming, then unlocks the format', async () => {
    const user = userEvent.setup()
    const { actionCalls } = mockEndpoints()
    renderPage()

    expect(await screen.findByLabelText('Prefix')).toBeDisabled()
    expect(
      screen.getByText('Remove all Pulsarr labels to change the format.'),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Remove' }))
    const dialog = await screen.findByRole('dialog')
    expect(
      within(dialog).getByText('Remove all Pulsarr labels?'),
    ).toBeInTheDocument()
    expect(actionCalls).toEqual([])

    await user.click(
      within(dialog).getByRole('button', { name: 'Remove labels' }),
    )

    expect(await screen.findByText('Labels removed')).toBeInTheDocument()
    expect(actionCalls).toEqual(['remove'])
    expect(screen.getByLabelText('Prefix')).toBeEnabled()
    expect(
      screen.queryByText('Remove all Pulsarr labels to change the format.'),
    ).not.toBeInTheDocument()
  })

  it('leaves a custom schedule untouched when saving other changes', async () => {
    const user = userEvent.setup()
    const { configBodies, scheduleBodies } = mockEndpoints({
      schedule: makeSchedule({ expression: '0 30 3 * * 1-5' }),
    })
    renderPage()

    expect(
      await screen.findByRole('combobox', { name: 'Day' }),
    ).toHaveTextContent('Custom: 0 30 3 * * 1-5')
    await user.click(
      screen.getByRole('switch', { name: 'Clean up orphaned labels on sync' }),
    )
    await user.click(screen.getByRole('switch', { name: 'Run on a schedule' }))
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByText('Changes saved')).toBeInTheDocument()
    expect(configBodies).toHaveLength(1)
    expect(scheduleBodies).toEqual([
      {
        type: 'cron',
        config: { expression: '0 30 3 * * 1-5' },
        enabled: false,
      },
    ])
    expect(screen.getByRole('combobox', { name: 'Day' })).toHaveTextContent(
      'Custom: 0 30 3 * * 1-5',
    )
  })
})
