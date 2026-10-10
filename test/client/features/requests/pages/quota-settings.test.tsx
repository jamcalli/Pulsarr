import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import QuotaSettingsPage from '@/features/requests/pages/quota-settings'
import type { ScheduleStatus } from '@/hooks/useSchedule'
import { setFormatLocale } from '@/lib/format'
import { queryClient } from '@/lib/queryClient'
import { server } from '../../../setup.js'
import { stubViewport } from '../../../viewport.js'

const savedConfig = {
  watchlistCapNotify: 'all',
  watchlistCapNotifyUser: false,
  quotaSettings: {
    cleanup: { enabled: true, retentionDays: 90 },
    weeklyRolling: { resetDays: 7 },
    monthly: { resetDay: 1, handleMonthEnd: 'last-day' },
  },
}

function makeSchedule({
  enabled = true,
  expression = '0 2 * * *',
} = {}): ScheduleStatus {
  return {
    id: 1,
    name: 'quota-maintenance',
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
} = {}) {
  const configBodies: unknown[] = []
  const scheduleBodies: unknown[] = []
  server.use(
    http.get('/v1/config', () =>
      HttpResponse.json({ success: true, config: savedConfig }),
    ),
    http.get('/v1/scheduler/schedules/quota-maintenance', () =>
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
      '/v1/scheduler/schedules/quota-maintenance',
      async ({ request }) => {
        scheduleBodies.push(await request.json())
        return scheduleStatus === 200
          ? HttpResponse.json({ success: true, message: 'ok' })
          : HttpResponse.json({}, { status: scheduleStatus })
      },
    ),
  )
  return { configBodies, scheduleBodies }
}

function renderPage() {
  const router = createMemoryRouter([
    { path: '*', element: <QuotaSettingsPage /> },
  ])
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

describe('QuotaSettingsPage', () => {
  beforeEach(() => {
    setFormatLocale('en-US')
    stubViewport({ mobile: false })
  })

  afterEach(() => {
    queryClient.clear()
    setFormatLocale(undefined)
    vi.unstubAllGlobals()
  })

  it('renders the saved schedule and settings', async () => {
    mockEndpoints()
    renderPage()

    expect(await screen.findByText('Quota maintenance')).toBeInTheDocument()
    expect(screen.getByText('Enabled')).toBeInTheDocument()
    expect(
      screen.getByRole('switch', { name: 'Run on a schedule' }),
    ).toBeChecked()
    expect(screen.getByRole('combobox', { name: 'Day' })).toHaveTextContent(
      'Every day',
    )
    expect(screen.getByRole('combobox', { name: 'Time' })).toHaveTextContent(
      /^2:00\sAM/,
    )
    expect(
      screen.getByRole('switch', { name: 'Delete old usage history' }),
    ).toBeChecked()
    expect(screen.getByLabelText('Count requests from the last')).toHaveValue(
      '7',
    )
    expect(screen.getByLabelText('Reset on day')).toHaveValue('1')
    expect(
      screen.getByRole('radio', { name: /Reset on the last day/ }),
    ).toBeChecked()
    expect(screen.getByLabelText('Keep usage history for')).toHaveValue('90')
    expect(
      screen.getByLabelText('Send cap notifications to'),
    ).toHaveTextContent('All channels')
    expect(
      screen.getByRole('switch', { name: 'Notify the user' }),
    ).not.toBeChecked()
    expect(screen.getByRole('button', { name: 'Run now' })).toBeEnabled()
  })

  it('saves the config and the schedule through their own endpoints', async () => {
    const user = userEvent.setup()
    const { configBodies, scheduleBodies } = mockEndpoints()
    renderPage()

    await user.click(
      await screen.findByRole('switch', { name: 'Notify the user' }),
    )
    await user.click(screen.getByRole('combobox', { name: 'Day' }))
    await user.click(await screen.findByRole('option', { name: 'Sunday' }))
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByText('Changes saved')).toBeInTheDocument()
    expect(configBodies).toEqual([
      { ...savedConfig, watchlistCapNotifyUser: true },
    ])
    expect(scheduleBodies).toEqual([
      { type: 'cron', config: { expression: '0 2 * * 0' }, enabled: true },
    ])
  })

  it('keeps the saved config and only the schedule dirty when the schedule save fails', async () => {
    const user = userEvent.setup()
    const { configBodies, scheduleBodies } = mockEndpoints({
      scheduleStatus: 500,
    })
    renderPage()

    await user.click(
      await screen.findByRole('switch', { name: 'Delete old usage history' }),
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
      { type: 'cron', config: { expression: '0 2 * * *' }, enabled: false },
    ])
    expect(screen.getByText('You have unsaved changes')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Discard' }))

    expect(
      screen.getByRole('switch', { name: 'Run on a schedule' }),
    ).toBeChecked()
    expect(
      screen.getByRole('switch', { name: 'Delete old usage history' }),
    ).not.toBeChecked()
    expect(
      screen.queryByText('You have unsaved changes'),
    ).not.toBeInTheDocument()
  })

  it('disables the retention field in place when cleanup is off', async () => {
    const user = userEvent.setup()
    mockEndpoints()
    renderPage()

    await user.click(
      await screen.findByRole('switch', { name: 'Delete old usage history' }),
    )

    expect(screen.getByLabelText('Keep usage history for')).toBeDisabled()
  })

  it('locks Run now while the saved schedule is off', async () => {
    mockEndpoints({ schedule: makeSchedule({ enabled: false }) })
    renderPage()

    expect(await screen.findByText('Disabled')).toBeInTheDocument()
    expect(
      screen.getByText('Turn on the schedule to run it now.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Run now' })).toBeDisabled()
    expect(screen.getByRole('combobox', { name: 'Day' })).toBeDisabled()
    expect(screen.getByRole('combobox', { name: 'Time' })).toBeDisabled()
  })

  it('locks Run now while the page has unsaved changes', async () => {
    const user = userEvent.setup()
    mockEndpoints()
    renderPage()

    await user.click(
      await screen.findByRole('switch', { name: 'Notify the user' }),
    )

    expect(screen.getByRole('button', { name: 'Run now' })).toBeDisabled()
    expect(
      screen.getByText(
        'Save or discard your changes first. A run uses the saved settings.',
      ),
    ).toBeInTheDocument()
  })

  it('leaves a custom schedule untouched when saving other changes', async () => {
    const user = userEvent.setup()
    const { configBodies, scheduleBodies } = mockEndpoints({
      schedule: makeSchedule({ expression: '30 2 * * 1-5' }),
    })
    renderPage()

    expect(
      await screen.findByRole('combobox', { name: 'Day' }),
    ).toHaveTextContent('Custom: 30 2 * * 1-5')
    await user.click(screen.getByRole('switch', { name: 'Notify the user' }))
    await user.click(screen.getByRole('switch', { name: 'Run on a schedule' }))
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByText('Changes saved')).toBeInTheDocument()
    expect(configBodies).toHaveLength(1)
    expect(scheduleBodies).toEqual([
      { type: 'cron', config: { expression: '30 2 * * 1-5' }, enabled: false },
    ])
    expect(screen.getByRole('combobox', { name: 'Day' })).toHaveTextContent(
      'Custom: 30 2 * * 1-5',
    )
  })

  it('shows a schedule with minutes as its day and time', async () => {
    const user = userEvent.setup()
    const { scheduleBodies } = mockEndpoints({
      schedule: makeSchedule({ expression: '30 2 * * 0' }),
    })
    renderPage()

    expect(
      await screen.findByRole('combobox', { name: 'Day' }),
    ).toHaveTextContent('Sunday')
    expect(screen.getByRole('combobox', { name: 'Time' })).toHaveTextContent(
      /^2:30\sAM/,
    )
    await user.click(screen.getByRole('switch', { name: 'Run on a schedule' }))
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByText('Changes saved')).toBeInTheDocument()
    expect(scheduleBodies).toEqual([
      { type: 'cron', config: { expression: '30 2 * * 0' }, enabled: false },
    ])
  })

  it('saves the whole quota settings object with new monthly values', async () => {
    const user = userEvent.setup()
    const { configBodies, scheduleBodies } = mockEndpoints()
    renderPage()

    const input = await screen.findByLabelText('Reset on day')
    await user.clear(input)
    await user.type(input, '15')
    await user.click(screen.getByRole('radio', { name: /Reset on the 1st/ }))
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByText('Changes saved')).toBeInTheDocument()
    expect(configBodies).toEqual([
      {
        ...savedConfig,
        quotaSettings: {
          ...savedConfig.quotaSettings,
          monthly: { resetDay: 15, handleMonthEnd: 'next-month' },
        },
      },
    ])
    expect(scheduleBodies).toEqual([])
  })

  it('blocks saving when retention is shorter than the longest quota period', async () => {
    const user = userEvent.setup()
    const { configBodies } = mockEndpoints()
    renderPage()

    const input = await screen.findByLabelText('Keep usage history for')
    await user.clear(input)
    await user.type(input, '20')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(
      await screen.findByText(
        'Usage history must be kept for at least 31 days so cleanup never removes requests that still count toward a quota.',
      ),
    ).toBeInTheDocument()
    expect(input).toHaveAccessibleDescription(
      'Usage history must be kept for at least 31 days so cleanup never removes requests that still count toward a quota.',
    )
    expect(configBodies).toEqual([])
  })
})
